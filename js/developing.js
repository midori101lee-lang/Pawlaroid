/* ========================================
   Developing.js - 拍立得显影动画（跨设备交互版）
   模拟真实拍立得：相纸滑出 → 空白相纸 → 渐进式显影 → 定影闪光

   显影进度由唯一共享状态 developmentProgress(0..1) 驱动：
   - 自动兜底：无操作时 DURATION 毫秒后自动完成
   - 移动端：摇一摇（DeviceMotion）-> addShake，提升进度 + 相纸震动
   - 电脑端：按住照片左右拖动 -> addDrag(距离)，提升进度
   三种输入都写入同一个 developmentProgress，视觉只据此渲染。

   动画只负责：透明度 / 模糊 / 对比（轻微）/ 纸张纹理
   不修改照片原本颜色，不叠加强对比滤镜
   ======================================== */

const Developing = {

    /* 自动显影兜底总时长（毫秒）：用户无操作时 10 秒后自动完成 */
    DURATION: 10000,

    stages: [
        { start: 0.00, end: 0.12, label: '照片正在慢慢出现…', hint: '相纸正在悄悄感光' },
        { start: 0.12, end: 0.35, label: '它的样子正在浮现…', hint: '轮廓正在一点点清晰' },
        { start: 0.35, end: 0.65, label: '颜色正在温暖地回来…', hint: '回忆正在被冲洗出来' },
        { start: 0.65, end: 0.90, label: '它在定影中…', hint: '让这一刻慢慢定格' },
        { start: 0.90, end: 1.00, label: '快要好了…', hint: '再等一下下' }
    ],

    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    startTime: 0,
    animFrame: null,
    autoTimer: null,
    onComplete: null,
    onProgress: null,
    isDone: false,

    /* 摇一摇节流：两次有效晃动最小间隔（毫秒） */
    _lastShake: 0,
    _shakeCooldown: 110,

    /**
     * 唯一共享显影进度 developmentProgress（0..1）。
     * 优先存放在 App.state.developmentProgress（移动端/电脑端共用同一变量）；
     * 若 App 尚未就绪，则退回到模块内 _progress，保证可独立运行。
     */
    get progress() {
        if (typeof App !== 'undefined' && App.state) return App.state.developmentProgress || 0;
        return this._progress || 0;
    },
    set progress(v) {
        v = this.clamp(v);
        if (typeof App !== 'undefined' && App.state) App.state.developmentProgress = v;
        this._progress = v;
    },

    /**
     * 初始化：把最终照片一次性绘制到 canvas（不修改像素）。
     * 显影过程只通过 CSS 滤镜（模糊/透明度/轻微对比）呈现，
     * 因此最终画面 = 原照片，颜色不偏移。
     */
    init(photoCanvas, displayCanvas, onComplete, onProgress) {
        this.onComplete = onComplete;
        this.onProgress = onProgress;
        this.isDone = false;
        this.progress = 0;

        /* canvas 尺寸匹配 polaroid 照片洞比例（887:831 ≈ 1.067:1） */
        this.width = 320;
        this.height = 300;

        this.canvas = displayCanvas;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.clearRect(0, 0, this.width, this.height);

        if (photoCanvas) {
            const pw = photoCanvas.width;
            const ph = photoCanvas.height;
            const targetRatio = this.width / this.height;
            const srcRatio = pw / ph;
            let sx, sy, sw, sh;
            if (srcRatio > targetRatio) {
                sh = ph;
                sw = ph * targetRatio;
                sx = (pw - sw) / 2;
                sy = 0;
            } else {
                sw = pw;
                sh = pw / targetRatio;
                sx = 0;
                sy = (ph - sh) / 2;
            }
            this.ctx.drawImage(photoCanvas, sx, sy, sw, sh, 0, 0, this.width, this.height);
        }

        /* 初始：照片隐藏 + 强模糊，等待显影阶段淡入 */
        this.canvas.style.opacity = '0';
        this.canvas.style.filter = 'blur(8px) contrast(0.9)';
    },

    start() {
        this.startTime = performance.now();
        /* 自动兜底：DURATION 后若仍在进行则补满进度（无操作场景） */
        this.autoTimer = setTimeout(() => {
            if (!this.isDone && this.progress < 1) this.progress = 1;
        }, this.DURATION);
        this._loop();
    },

    stop() {
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
        if (this.autoTimer) {
            clearTimeout(this.autoTimer);
            this.autoTimer = null;
        }
    },

    /** 当前进度对应的文案阶段 */
    getCurrentStage(progress) {
        for (let i = 0; i < this.stages.length; i++) {
            if (progress >= this.stages[i].start && progress < this.stages[i].end) {
                return this.stages[i];
            }
        }
        return this.stages[this.stages.length - 1];
    },

    clamp(v) {
        return Math.max(0, Math.min(1, v));
    },

    easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    },

    /**
     * 显影透明度曲线：0% → 30% → 60% → 100%
     * 相纸滑出阶段（前 12%）保持全隐藏，之后渐进浮现。
     */
    developOpacity(p) {
        if (p < 0.12) return 0;
        if (p < 0.32) return 0.30 * ((p - 0.12) / 0.20);
        if (p < 0.58) return 0.30 + 0.30 * ((p - 0.32) / 0.26);
        return 0.60 + 0.40 * ((p - 0.58) / 0.42);
    },

    /** 渲染循环：读取共享 progress，统一驱动视觉 */
    _loop() {
        const elapsed = performance.now() - this.startTime;
        /* 自动兜底进度（取与手动进度的最大值，手动可超车） */
        if (!this.isDone) {
            const autoP = Math.min(elapsed / this.DURATION, 1);
            if (autoP > this.progress) this.progress = autoP;
        }
        this._render();

        if (this.progress >= 1) {
            if (!this.isDone) {
                this.isDone = true;
                this.stop();
                if (this.onComplete) this.onComplete();
            }
        } else {
            this.animFrame = requestAnimationFrame(() => this._loop());
        }
    },

    /** 按当前 progress 应用 opacity / blur / contrast / 纸张纹理淡出 */
    _render() {
        const p = this.progress;

        /* 1) 照片显影：仅透明度 + 模糊 + 轻微对比（不改颜色） */
        this.canvas.style.opacity = this.developOpacity(p).toFixed(3);
        if (p > 0.12) {
            const t = this.easeOut(this.clamp((p - 0.12) / 0.88));
            const blur = (8 * (1 - t)).toFixed(2);           // 8px → 0px：轮廓先现，细节后清
            const contrast = (0.9 + 0.1 * t).toFixed(3);      // 略低 → 正常（非强对比）
            this.canvas.style.filter = `blur(${blur}px) contrast(${contrast})`;
        }

        /* 2) 空白相纸纹理淡出（显影前覆盖在照片区上方） */
        const blank = document.getElementById('developBlank');
        if (blank) {
            const b = p < 0.12 ? 1 : this.clamp(1 - (p - 0.12) / 0.48);
            blank.style.opacity = b.toFixed(3);
        }

        /* 3) 阶段提示文案 */
        if (this.onProgress) {
            const stage = this.getCurrentStage(p);
            this.onProgress(p, stage);
        }
    },

    /**
     * 移动端：摇一摇显影。
     * magnitude 为归一化晃动强度（0..1），每次有效晃动提升进度并触发相纸轻微震动。
     */
    addShake(magnitude) {
        const now = performance.now();
        if (now - this._lastShake < this._shakeCooldown) return;
        this._lastShake = now;
        const intensity = this.clamp(magnitude || 0.5);
        this.progress = this.clamp(this.progress + 0.03 + 0.06 * intensity);
        this.paperJitter();
        if (this.progress >= 1 && !this.isDone) {
            this._render();
            this.isDone = true;
            this.stop();
            if (this.onComplete) this.onComplete();
        }
    },

    /**
     * 电脑端：按住照片左右拖动显影。
     * deltaPx 为本次移动的像素距离（带符号，绝对值计入）。100px ≈ 10%。
     */
    addDrag(deltaPx) {
        this.progress = this.clamp(this.progress + Math.abs(deltaPx) / 1000);
        if (this.progress >= 1 && !this.isDone) {
            this._render();
            this.isDone = true;
            this.stop();
            if (this.onComplete) this.onComplete();
        }
    },

    /** 相纸轻微震动（晃动时的 paper vibration 反馈） */
    paperJitter() {
        if (!this.canvas) return;
        const card = this.canvas.closest('.developing-card');
        if (!card) return;
        card.classList.remove('shake-jitter');
        void card.offsetWidth; // 强制回流，确保动画可重放
        card.classList.add('shake-jitter');
    }
};
