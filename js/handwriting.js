/* ========================================
   Handwriting.js - 全屏手写留言编辑器
   ----------------------------------------------------
   设计目标：模拟在真实拍立得白色区域写留言的体验。
   - 高分辨率离屏 buffer（3x 于拍立得签名区），保证导出清晰
   - 笔画存储 → 支持撤销 / 清空
   - 油性马克笔模拟：圆角笔头 + 深棕 + 略透明
   - 显示画布与 buffer 同分辨率，手指书写实时同步
   导出时按比例 (1:3) 映射回拍立得签名区，仅影响白边。
   ======================================== */

const Handwriting = {

    /* 离屏 buffer 尺寸 = 拍立得签名区 (887x230) 的 3 倍，导出时 1:3 映射回 PNG */
    BUFFER_W: 2661,
    BUFFER_H: 690,

    /* 离屏 buffer（仅存笔迹，透明背景；白色来自拍立得 PNG） */
    buffer: null,
    bufferCtx: null,

    /* 屏幕上的大号画布（内部分辨率 = buffer，CSS 放大显示） */
    display: null,
    dctx: null,

    /* 笔画记录，用于撤销 / 重绘 */
    strokes: [],
    current: null,

    /* 笔刷参数 */
    color: '#3D2817',     // 默认深棕（油性马克笔）
    size: 28,             // 默认笔触（buffer 像素）
    alpha: 0.9,           // 略透明

    isDrawing: false,
    _setup: false,

    /**
     * 初始化一次：创建离屏 buffer 与显示画布、绑定事件
     */
    setup(displayCanvas) {
        if (this._setup) return;
        this.display = displayCanvas;
        this.dctx = displayCanvas.getContext('2d');
        displayCanvas.width = this.BUFFER_W;
        displayCanvas.height = this.BUFFER_H;

        this.buffer = document.createElement('canvas');
        this.buffer.width = this.BUFFER_W;
        this.buffer.height = this.BUFFER_H;
        this.bufferCtx = this.buffer.getContext('2d');

        this._bind();
        this._setup = true;
        this.show();
    },

    /**
     * 每次打开手写模式时调用：刷新显示
     */
    show() {
        if (!this._setup) return;
        this._syncDisplay();
        this._refreshPlaceholder();
    },

    /**
     * 绑定指针事件（只绑一次）
     */
    _bind() {
        const c = this.display;

        const onDown = (e) => {
            e.preventDefault();
            const pt = this._getPoint(e);
            this.begin(pt.x, pt.y);
        };
        const onMove = (e) => {
            if (!this.isDrawing) return;
            e.preventDefault();
            const pt = this._getPoint(e);
            this.move(pt.x, pt.y);
        };
        const onUp = () => { this.end(); };

        // 鼠标
        c.addEventListener('mousedown', onDown);
        c.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        // 触摸
        c.addEventListener('touchstart', onDown, { passive: false });
        c.addEventListener('touchmove', onMove, { passive: false });
        c.addEventListener('touchend', onUp);
        c.addEventListener('touchcancel', onUp);
    },

    /**
     * 把屏幕坐标映射到 buffer 坐标
     */
    _getPoint(e) {
        const rect = this.display.getBoundingClientRect();
        const sx = this.display.width / rect.width;
        const sy = this.display.height / rect.height;
        let cx, cy;
        if (e.touches && e.touches[0]) {
            cx = e.touches[0].clientX;
            cy = e.touches[0].clientY;
        } else {
            cx = e.clientX;
            cy = e.clientY;
        }
        return {
            x: (cx - rect.left) * sx,
            y: (cy - rect.top) * sy
        };
    },

    /* ---------- 笔画生命周期 ---------- */

    begin(x, y) {
        this.isDrawing = true;
        this.current = {
            color: this.color,
            width: this.size,
            alpha: this.alpha,
            points: [{ x, y }]
        };
        this._drawDotBoth(x, y, this.current);
        this.hidePlaceholder();
    },

    move(x, y) {
        if (!this.isDrawing || !this.current) return;
        const p = this.current.points;
        const last = p[p.length - 1];
        // 过滤过小的移动，减少冗余点
        if (Math.hypot(x - last.x, y - last.y) < 1.5) return;
        p.push({ x, y });
        const a = p[p.length - 2];
        const b = p[p.length - 1];
        this._drawSeg(this.bufferCtx, a, b, this.current);
        this._drawSeg(this.dctx, a, b, this.current);
    },

    end() {
        if (this.current) {
            this.strokes.push(this.current);
            this.current = null;
        }
        this.isDrawing = false;
    },

    /* ---------- 绘制：油性马克笔模拟 ---------- */

    _drawSeg(ctx, A, B, stroke) {
        const dist = Math.hypot(B.x - A.x, B.y - A.y);
        const steps = Math.max(1, Math.ceil(dist / 2));
        let px = A.x, py = A.y;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = A.x + (B.x - A.x) * t;
            const y = A.y + (B.y - A.y) * t;

            // 笔宽轻微抖动，模拟马克笔手感
            const wj = stroke.width * (0.86 + Math.random() * 0.28);

            // 略透明 + 圆角笔头
            ctx.globalAlpha = stroke.alpha * (0.88 + Math.random() * 0.12);
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = wj;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
            ctx.stroke();

            // 偶发墨点：模拟出墨不均的油性笔
            if (Math.random() < 0.08) {
                ctx.globalAlpha = stroke.alpha * 0.5;
                ctx.fillStyle = stroke.color;
                ctx.beginPath();
                ctx.arc(
                    x + (Math.random() - 0.5) * wj * 0.6,
                    y + (Math.random() - 0.5) * wj * 0.6,
                    wj * 0.5, 0, Math.PI * 2
                );
                ctx.fill();
            }
            px = x; py = y;
        }
        ctx.globalAlpha = 1;
    },

    _drawDotBoth(x, y, stroke) {
        [this.bufferCtx, this.dctx].forEach(ctx => {
            ctx.globalAlpha = stroke.alpha;
            ctx.fillStyle = stroke.color;
            ctx.beginPath();
            ctx.arc(x, y, stroke.width * 0.5, 0, Math.PI * 2);
            ctx.fill();
        });
        this.bufferCtx.globalAlpha = 1;
        this.dctx.globalAlpha = 1;
    },

    /* ---------- 工具：撤销 / 清空 / 颜色 / 大小 ---------- */

    undo() {
        if (!this.strokes.length) return;
        this.strokes.pop();
        this._redraw();
        if (!this.strokes.length) this.showPlaceholder();
    },

    clear() {
        this.strokes = [];
        this.current = null;
        if (this.bufferCtx) this.bufferCtx.clearRect(0, 0, this.BUFFER_W, this.BUFFER_H);
        this._syncDisplay();
        this.showPlaceholder();
    },

    setColor(color) {
        this.color = color;
        document.querySelectorAll('.hw-color').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === color);
        });
    },

    setSize(px) {
        this.size = Number(px) || this.size;
    },

    /* 整图重绘（撤销 / 清空后调用） */
    _redraw() {
        this.bufferCtx.clearRect(0, 0, this.BUFFER_W, this.BUFFER_H);
        for (const stroke of this.strokes) {
            const pts = stroke.points;
            this._drawDotBoth(pts[0].x, pts[0].y, stroke);
            for (let i = 1; i < pts.length; i++) {
                this._drawSeg(this.bufferCtx, pts[i - 1], pts[i], stroke);
            }
        }
        this._syncDisplay();
    },

    /* 把离屏 buffer 同步到显示画布 */
    _syncDisplay() {
        if (!this.dctx) return;
        this.dctx.clearRect(0, 0, this.BUFFER_W, this.BUFFER_H);
        this.dctx.drawImage(this.buffer, 0, 0);
    },

    /* ---------- 占位提示 ---------- */
    hidePlaceholder() {
        const ph = document.getElementById('handwritePlaceholder');
        if (ph) ph.style.display = 'none';
    },
    showPlaceholder() {
        const ph = document.getElementById('handwritePlaceholder');
        if (ph) ph.style.display = '';
    },
    _refreshPlaceholder() {
        if (this.strokes.length) this.hidePlaceholder();
        else this.showPlaceholder();
    },

    /* ---------- 对外接口 ---------- */

    /**
     * 返回离屏 buffer（透明背景 + 笔迹），供结果页预览与导出合成
     */
    getBuffer() {
        return this.buffer;
    },

    /**
     * 载入已有笔迹 buffer（再次编辑时使用）
     */
    loadBuffer(srcCanvas) {
        if (!this.bufferCtx || !srcCanvas) return;
        this.bufferCtx.clearRect(0, 0, this.BUFFER_W, this.BUFFER_H);
        this.bufferCtx.drawImage(srcCanvas, 0, 0, this.BUFFER_W, this.BUFFER_H);
        this.strokes = []; // 历史笔迹无法还原为笔画，仅保留像素，新笔画可继续撤销
        this._syncDisplay();
        this._refreshPlaceholder();
    },

    /**
     * 新照片时重置
     */
    reset() {
        this.strokes = [];
        this.current = null;
        if (this.bufferCtx) this.bufferCtx.clearRect(0, 0, this.BUFFER_W, this.BUFFER_H);
        this._syncDisplay();
        this.showPlaceholder();
    }
};
