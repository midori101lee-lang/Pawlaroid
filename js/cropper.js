/* ========================================
   Cropper.js - 1:1 图片裁剪
   支持拖动、缩放、保存裁剪结果
   ======================================== */

const Cropper = {

    canvas: null,
    ctx: null,
    image: null,
    imageWidth: 0,
    imageHeight: 0,

    // 显示参数
    scale: 1,           // 用户缩放
    baseScale: 1,       // 基础缩放（cover 到容器）
    offsetX: 0,         // 偏移 X（正负）
    offsetY: 0,         // 偏移 Y

    // 拖动状态
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartOffsetX: 0,
    dragStartOffsetY: 0,

    // 触摸缩放
    pinchDistance: 0,
    pinchStartScale: 1,
    minScale: 0.5,
    maxScale: 3,

    init(image) {
        this.image = image;
        this.imageWidth = image.naturalWidth || image.width;
        this.imageHeight = image.naturalHeight || image.height;

        this.canvas = document.getElementById('cropCanvas');
        const container = this.canvas.parentElement;
        const size = container.offsetWidth;
        this.canvas.width = size;
        this.canvas.height = size;
        this.ctx = this.canvas.getContext('2d');

        // 计算基础缩放：cover 到正方形容器
        // 最小边填满容器
        this.baseScale = Math.max(
            size / this.imageWidth,
            size / this.imageHeight
        );

        // 初始缩放 + 一点放大（更突出宠物）
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;

        this.bindEvents(container);
        this.render();

        // 同步 slider
        const slider = document.getElementById('zoomSlider');
        if (slider) slider.value = this.scale;
    },

    bindEvents(container) {
        const onDown = (e) => {
            if (e.touches && e.touches.length === 2) {
                // 双指捏合
                this.isDragging = false;
                this.pinchDistance = this.getPinchDist(e.touches);
                this.pinchStartScale = this.scale;
                return;
            }
            this.isDragging = true;
            const pt = this.getPoint(e);
            this.dragStartX = pt.x;
            this.dragStartY = pt.y;
            this.dragStartOffsetX = this.offsetX;
            this.dragStartOffsetY = this.offsetY;
            this.canvas.style.cursor = 'grabbing';
        };

        const onMove = (e) => {
            if (e.touches && e.touches.length === 2 && this.pinchDistance > 0) {
                e.preventDefault();
                const newDist = this.getPinchDist(e.touches);
                const ratio = newDist / this.pinchDistance;
                const newScale = this.clamp(this.pinchStartScale * ratio, this.minScale, this.maxScale);
                this.setScale(newScale);
                return;
            }
            if (!this.isDragging) return;
            e.preventDefault();
            const pt = this.getPoint(e);
            const dx = pt.x - this.dragStartX;
            const dy = pt.y - this.dragStartY;
            this.offsetX = this.dragStartOffsetX + dx;
            this.offsetY = this.dragStartOffsetY + dy;
            this.render();
        };

        const onUp = () => {
            this.isDragging = false;
            this.pinchDistance = 0;
            this.canvas.style.cursor = 'move';
        };

        // 鼠标事件
        container.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        // 触摸事件
        container.addEventListener('touchstart', onDown, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);

        // 滚轮缩放
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        }, { passive: false });
    },

    getPoint(e) {
        if (e.touches && e.touches[0]) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    },

    getPinchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    },

    clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    },

    /**
     * 渲染当前缩放和偏移到 canvas
     */
    render() {
        const size = this.canvas.width;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, size, size);

        // 计算实际显示尺寸
        const totalScale = this.baseScale * this.scale;
        const drawW = this.imageWidth * totalScale;
        const drawH = this.imageHeight * totalScale;

        // 居中绘制 + 偏移
        const drawX = (size - drawW) / 2 + this.offsetX;
        const drawY = (size - drawH) / 2 + this.offsetY;

        // 裁切到正方形
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, size, size);
        ctx.clip();
        ctx.drawImage(this.image, drawX, drawY, drawW, drawH);
        ctx.restore();
    },

    /**
     * 设置缩放
     */
    setScale(value) {
        this.scale = this.clamp(value, this.minScale, this.maxScale);
        const slider = document.getElementById('zoomSlider');
        if (slider) slider.value = this.scale;
        this.render();
    },

    /**
     * 增量缩放
     */
    zoom(delta) {
        this.setScale(this.scale + delta);
    },

    /**
     * 滑块缩放（由 #zoomSlider 的 oninput 触发）
     * slider.value → scale 双向同步 → 重新绘制 canvas
     * 调试：输出 当前slider值 / 当前scale / canvas绘制尺寸，确认三者同步
     */
    setZoom(value) {
        const v = Number(value);
        if (isNaN(v)) return;
        this.setScale(v);
        const drawW = this.imageWidth * this.baseScale * this.scale;
        const drawH = this.imageHeight * this.baseScale * this.scale;
        console.log(
            '[Cropper] 当前slider值=' + this.scale +
            ' | 当前scale=' + this.scale +
            ' | canvas绘制尺寸=' + drawW.toFixed(1) + 'x' + drawH.toFixed(1)
        );
    },

    /**
     * 重置
     */
    reset() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        const slider = document.getElementById('zoomSlider');
        if (slider) slider.value = 1;
        this.render();
    },

    /**
     * 获取裁剪结果（正方形 canvas）
     * 与 render() 使用完全相同的变换 S / imgX / imgY，
     * 保证输出与界面预览框所见完全一致。
     */
    getCroppedCanvas(size) {
        size = size || 600;
        const out = document.createElement('canvas');
        out.width = size;
        out.height = size;
        const ctx = out.getContext('2d');

        const refSize = this.canvas.width;        // 显示画布边长（正方形）
        const S = this.baseScale * this.scale;    // 每原图像素对应的显示像素数
        const drawW = this.imageWidth * S;
        const drawH = this.imageHeight * S;
        // 图片左上角在显示坐标系中的位置（与 render 一致）
        const imgX = (refSize - drawW) / 2 + this.offsetX;
        const imgY = (refSize - drawH) / 2 + this.offsetY;

        // 显示裁剪框 [0, refSize] 反向映射回原图像素坐标：
        //   显示像素 px → 原图像素 = (px - imgX) / S
        const sx = (0 - imgX) / S;
        const sy = (0 - imgY) / S;
        const sw = refSize / S;
        const sh = refSize / S;

        ctx.drawImage(this.image, sx, sy, sw, sh, 0, 0, size, size);
        return out;
    }
};