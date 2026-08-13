/* ========================================
   polaroid.js - 拍立得相框（PNG overlay 版）
   用 /拍立得边框/*.webp 作为顶层 overlay，
   透明洞自动显出底层照片。
   ======================================== */

const Polaroid = {

    /* PNG 物理像素尺寸（默认拍立得：1254x1254）
       相框 PNG（600x600）的可见内容区域 [54..545]×[17..574]，
       拉伸到 1254 后四周有 ~112px 透明空白区——渲染末尾自动裁剪去除。 */
    FRAME_WIDTH: 1254,
    FRAME_HEIGHT: 1254,

    /* PNG 中照片洞的位置（在未裁剪的 1254×1254 渲染画布坐标系下）
       测量方法见 PIL：alpha<30 的连续区域，bounds = (185, 127) - (1071, 957).
       render() 末尾调用 _cropToContent 移除四周透明边距后，外部使用 getPhotoRegion()
       获取裁剪后坐标。 */
    PHOTO_X: 185,
    PHOTO_Y: 127,
    PHOTO_W: 887,
    PHOTO_H: 831,

    /* PNG 中签名区位置（未裁剪坐标系） */
    SIG_X: 185,
    SIG_Y: 968,
    SIG_W: 887,
    SIG_H: 230,

    /* _cropToContent() 后填充，供 getPhotoRegion/getSignatureRegion 调整坐标 */
    _cropOffsetX: 0,
    _cropOffsetY: 0,

    /* 帧图像缓存 */
    _frameCache: {},

    /**
     * 预加载相纸 PNG 帧图像
     */
    preloadFrame(filePath) {
        if (this._frameCache[filePath]) {
            return Promise.resolve(this._frameCache[filePath]);
        }
        return new Promise((resolve, reject) => {
            const img = new Image();
            // 同源 assets，无需 crossOrigin
            img.onload = () => {
                this._frameCache[filePath] = img;
                resolve(img);
            };
            img.onerror = () => {
                console.warn('相纸 PNG 加载失败:', filePath);
                reject(new Error('Frame load failed: ' + filePath));
            };
            img.src = filePath;
        });
    },

    /**
     * 获取拍立得画布尺寸（与 PNG 同比例）
     */
    getDimensions() {
        return {
            width: this.FRAME_WIDTH,
            height: this.FRAME_HEIGHT,
            photoX: this.PHOTO_X,
            photoY: this.PHOTO_Y,
            photoSize: this.PHOTO_W,
            photoW: this.PHOTO_W,
            photoH: this.PHOTO_H
        };
    },

    /**
     * 获取签名区在裁剪后画布上的位置（用于手写覆盖） */
    getSignatureRegion() {
        return {
            x: this.SIG_X - this._cropOffsetX,
            y: this.SIG_Y - this._cropOffsetY,
            w: this.SIG_W,
            h: this.SIG_H
        };
    },

    /**
     * 获取照片洞在裁剪后画布上的位置（用于从 basePolaroid 提取照片区域） */
    getPhotoRegion() {
        return {
            x: this.PHOTO_X - this._cropOffsetX,
            y: this.PHOTO_Y - this._cropOffsetY,
            w: this.PHOTO_W,
            h: this.PHOTO_H
        };
    },

    /**
     * 渲染完整拍立得（纯净：照片 + 胶片质感 + 相纸 PNG 边框）
     * 不再把日期/文字直接绘制到画布上，保持图片纯净，
     * 日期等信息交由"照片回忆确认页面"以文字形式展示，便于未来成长日记扩展。
     * @param {HTMLCanvasElement} photoCanvas - 已应用胶片配方的照片 canvas (1:1)
     * @param {Object} options
     *   - paperFile: 相纸 PNG 路径
     */
    async render(photoCanvas, options) {
        options = options || {};
        const paperFile = options.paperFile || 'frames/classic_white.webp';

        // 1. 加载相纸 PNG 帧
        let frameImg;
        try {
            frameImg = await this.preloadFrame(paperFile);
        } catch (e) {
            // 加载失败时回退到默认相纸
            frameImg = await this.preloadFrame(window.ASSET_CONFIG ? window.ASSET_CONFIG.resolve('frames/classic_white.webp') : 'frames/classic_white.webp');
        }

        // 2. 创建画布（按 PNG 原生像素）
        const canvas = document.createElement('canvas');
        canvas.width = this.FRAME_WIDTH;
        canvas.height = this.FRAME_HEIGHT;
        const ctx = canvas.getContext('2d');

        // 3. 背景填米白（PNG 透明洞外的兜底色，确保没有透出底图）
        ctx.fillStyle = '#FFFBF2';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 4. 绘制照片到 PNG 透明洞内（cover 裁切，保证比例不失真）
        if (photoCanvas) {
            this._drawPhotoIntoRegion(ctx, photoCanvas, this.PHOTO_X, this.PHOTO_Y, this.PHOTO_W, this.PHOTO_H);
        }

        // 5. 最顶层叠加相纸 PNG 帧
        //    PNG 透明区域（照片洞）会显出底层照片
        //    PNG 不透明区域（白边）会盖在底层之上，形成"贴上相纸"的效果
        ctx.drawImage(frameImg, 0, 0, this.FRAME_WIDTH, this.FRAME_HEIGHT);

        // 6. 裁剪掉相框 PNG 四周的透明留白（原图 600px 有 54/17/54/25 边距），
        //    使输出图片边界 = 真实相纸边界，消除用户看到的"额外白边"
        return this._cropToContent(canvas);
    },

    /**
     * 裁剪画布到相框可见内容的边界（去除 PNG 透明边距产生的暖白边框）。
     * 所有相框的透明边距一致：L=9.0%, R=9.0%, T=2.83%, B=4.17%（相对原图 600px）。
     * @param {HTMLCanvasElement} canvas
     * @returns {HTMLCanvasElement} 裁剪后的画布
     */
    _cropToContent(canvas) {
        const w = canvas.width;
        const h = canvas.height;
        const marginL = Math.round(w * (54 / 600));
        const marginR = Math.round(w * (54 / 600));
        const marginT = Math.round(h * (17 / 600));
        const marginB = Math.round(h * (25 / 600));

        const newW = w - marginL - marginR;
        const newH = h - marginT - marginB;
        if (newW <= 0 || newH <= 0) return canvas;

        // 记录裁剪偏移，供 getPhotoRegion / getSignatureRegion 调整外部坐标
        this._cropOffsetX = marginL;
        this._cropOffsetY = marginT;

        const out = document.createElement('canvas');
        out.width = newW;
        out.height = newH;
        const ctx = out.getContext('2d');
        ctx.drawImage(canvas, marginL, marginT, newW, newH, 0, 0, newW, newH);
        return out;
    },

    /**
     * 将照片按 cover 模式绘制到指定矩形区域
     */
    _drawPhotoIntoRegion(ctx, photoCanvas, x, y, w, h) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        const pw = photoCanvas.width;
        const ph = photoCanvas.height;
        const pSize = Math.max(pw, ph);   // 选较长边（cover 模式）
        const drawW = pw * (w / pSize);
        const drawH = ph * (h / pSize);
        const drawX = x + (w - drawW) / 2;
        const drawY = y + (h - drawH) / 2;
        ctx.drawImage(photoCanvas, drawX, drawY, drawW, drawH);
        ctx.restore();

        // 照片内部微弱暖色暗角（贴近 PNG 风格的胶片相纸）
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        const innerGrad = ctx.createLinearGradient(x, y, x, y + h);
        innerGrad.addColorStop(0, 'rgba(80,50,30,0.05)');
        innerGrad.addColorStop(0.05, 'rgba(0,0,0,0)');
        innerGrad.addColorStop(0.95, 'rgba(0,0,0,0)');
        innerGrad.addColorStop(1, 'rgba(80,50,30,0.04)');
        ctx.fillStyle = innerGrad;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
    },

    /**
     * 同步版本：使用默认相纸（用于不需要异步加载的快速预览）
     * 内部仍异步加载，但调用方拿到的是临时画布，PNG 加载完后会重绘
     */
    renderSync(photoCanvas, options) {
        // 直接用与 render 相同的逻辑，但不返回 promise
        // （调用方需自行等待 preload）
        const paperFile = (options && options.paperFile) || 'frames/classic_white.webp';

        let frameImg = this._frameCache[paperFile] || this._frameCache['frames/classic_white.webp'];
        if (!frameImg) {
            // 还没预加载完成，返回纯照片画布（让调用方在加载完后重绘）
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.FRAME_WIDTH;
        canvas.height = this.FRAME_HEIGHT;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFBF2';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (photoCanvas) {
            this._drawPhotoIntoRegion(ctx, photoCanvas, this.PHOTO_X, this.PHOTO_Y, this.PHOTO_W, this.PHOTO_H);
        }
        ctx.drawImage(frameImg, 0, 0, this.FRAME_WIDTH, this.FRAME_HEIGHT);

        return canvas;
    },

    /**
     * 格式化日期
     */
    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}.${m}.${d}`;
    },

    /**
     * 触发下载
     */
    download(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename || `pawlaroid_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
};