/* ============================================================
   share-save.js — 移动端“保存到相册”通用方案
   ------------------------------------------------------------
   目标：在 iOS Safari / Android 浏览器 / 微信浏览器 中，把生成的
   拍立得、展示墙、时光机图片直接保存到系统相册（照片 App / 图库）。

   浏览器能力现实：
   - 没有任何浏览器能“强制写”系统相册（隐私限制）。
   - 唯一标准能力是 Web Share API（navigator.share + files）：
     调起系统分享面板，用户可选“存储到照片 / 保存图片”。
   - iOS Safari、微信浏览器在不支持原生分享时，最可靠的方式是
     把图片渲染到页面，提示“长按图片即可保存到相册”。

   方案优先级（见 save()）：
   1) 原生分享（带文件）——能直接进系统相册。
   2) 兜底浮层：① 长按图片保存（iOS/微信最可靠）；
      ② “系统分享 / 保存”按钮再次尝试原生分享；
      ③ “下载图片”链接（Android / 桌面）。
   3) 桌面（非移动 UA）：直接触发下载，保持原有体验。

   依赖：纯 canvas → Blob，不使用任何外部资源，file:// 友好。
   ============================================================ */
const MobileSave = {
    /* ---------- 设备识别 ---------- */
    _isIOS() {
        const ua = navigator.userAgent || '';
        return /iP(ad|hone|od)/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    },
    _isAndroid() {
        return /Android/.test(navigator.userAgent || '');
    },
    _isWeChat() {
        return /MicroMessenger/i.test(navigator.userAgent || '');
    },
    _isMobile() {
        return this._isIOS() || this._isAndroid() || this._isWeChat();
    },

    /* 是否支持“带文件的原生分享”（iOS 15+ / Android Chrome） */
    _canShareFiles() {
        try {
            if (!navigator.share) return false;
            if (navigator.canShare) {
                const f = new File([new Uint8Array([1])], 'p.png', { type: 'image/png' });
                return !!navigator.canShare({ files: [f] });
            }
            return false;
        } catch (e) {
            return false;
        }
    },

    /* ---------- canvas → Blob ---------- */
    _canvasToBlob(canvas, type, quality) {
        return new Promise((resolve) => {
            let done = false;
            const finish = (b) => { if (done) return; done = true; resolve(b); };
            try {
                if (canvas.toBlob) {
                    canvas.toBlob((b) => finish(b), type || 'image/png', quality);
                    // 超时兜底：极少数浏览器 toBlob 回调不触发，
                    // 回退到同步 toDataURL，保证保存 Promise 必然 resolve。
                    setTimeout(() => {
                        try { finish(this._dataURLToBlob(canvas.toDataURL(type || 'image/png', quality || 1))); }
                        catch (e2) { finish(null); }
                    }, 4000);
                    return;
                }
            } catch (e) { /* 落到 dataURL 兜底 */ }
            try {
                finish(this._dataURLToBlob(canvas.toDataURL(type || 'image/png', quality || 1)));
            } catch (e2) {
                finish(null);
            }
        });
    },

    _dataURLToBlob(url) {
        const arr = url.split(',');
        const m = /image\/(\w+)/.exec(arr[0] || '');
        const mime = m ? 'image/' + m[1] : 'image/png';
        const bin = atob(arr[1] || '');
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return new Blob([u8], { type: mime });
    },

    /* ---------- 统一入口 ---------- */
    /**
     * 把 canvas 保存到相册（移动端优先）或下载（桌面）。
     * @param {HTMLCanvasElement} canvas
     * @param {string} filename
     * @returns {Promise<{method:string}>} method: share | overlay | download | cancelled | error
     */
    async save(canvas, filename) {
        const fname = filename || ('pawlaroid_' + Date.now() + '.png');
        let blob = await this._canvasToBlob(canvas, 'image/png');
        if (!blob) {
            this._toast('图片生成失败，请重试🐾');
            return { method: 'error' };
        }

        // 1) 原生分享（带文件）—— 可直接“存储到照片”
        if (this._canShareFiles()) {
            try {
                const file = new File([blob], fname, { type: 'image/png' });
                await navigator.share({
                    files: [file],
                    title: 'Pawlaroid',
                    text: '我的宠物拍立得 🐾'
                });
                return { method: 'share' };
            } catch (e) {
                if (e && e.name === 'AbortError') return { method: 'cancelled' };
                // 其它错误（权限/不支持）→ 继续兜底
            }
        }

        // 2) 桌面：直接下载，保持原有体验
        if (!this._isMobile()) {
            try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fname;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                if (window.App && App.toast) App.toast('回忆已经保存🐾');
                else alert('回忆已经保存🐾');
                return { method: 'download' };
            } catch (e) {
                this._toast('导出失败，请重试🐾');
                return { method: 'error' };
            }
        }

        // 3) 移动端兜底浮层：长按保存 / 分享 / 下载
        this._showOverlay(canvas, fname, blob);
        return { method: 'overlay' };
    },

    /* ---------- 兜底浮层 ---------- */
    _showOverlay(canvas, fname, blob) {
        const old = document.getElementById('saveAlbumOverlay');
        if (old && old.parentNode) old.parentNode.removeChild(old);

        const ov = document.createElement('div');
        ov.id = 'saveAlbumOverlay';
        ov.className = 'save-album-overlay';

        const modal = document.createElement('div');
        modal.className = 'save-album-modal';

        // 图片（长按可保存）
        const imgWrap = document.createElement('div');
        imgWrap.className = 'save-album-imgwrap';
        const img = document.createElement('img');
        img.className = 'save-album-img';
        img.alt = 'Pawlaroid 回忆';
        img.setAttribute('draggable', 'false');
        let dataURL = '';
        try { dataURL = canvas.toDataURL('image/png'); } catch (e) {}
        if (blob) {
            try { img.src = URL.createObjectURL(blob); }
            catch (e) { if (dataURL) img.src = dataURL; }
        } else if (dataURL) {
            img.src = dataURL;
        }

        // 文案
        const tip = document.createElement('p');
        tip.className = 'save-album-tip';
        tip.textContent = '长按图片即可保存到相册 🐾';

        // 操作区
        const actions = document.createElement('div');
        actions.className = 'save-album-actions';

        const shareBtn = document.createElement('button');
        shareBtn.className = 'save-album-btn primary';
        shareBtn.type = 'button';
        shareBtn.textContent = '系统分享 / 保存';
        shareBtn.addEventListener('click', async () => {
            if (navigator.share && blob) {
                try {
                    const file = new File([blob], fname, { type: 'image/png' });
                    await navigator.share({ files: [file], title: 'Pawlaroid', text: '我的宠物拍立得 🐾' });
                } catch (e) { /* 用户取消或不支持，忽略 */ }
            } else {
                this._toast('请长按图片保存到相册 🐾');
            }
        });

        const dl = document.createElement('a');
        dl.className = 'save-album-btn';
        dl.textContent = '下载图片';
        dl.download = fname;
        dl.href = (dataURL || (blob ? URL.createObjectURL(blob) : '#'));

        const closeBtn = document.createElement('button');
        closeBtn.className = 'save-album-btn ghost';
        closeBtn.type = 'button';
        closeBtn.textContent = '关闭';
        closeBtn.addEventListener('click', () => {
            ov.classList.remove('on');
            setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 300);
            if (img.src && img.src.indexOf('blob:') === 0) {
                try { URL.revokeObjectURL(img.src); } catch (e) {}
            }
        });

        actions.appendChild(shareBtn);
        actions.appendChild(dl);
        actions.appendChild(closeBtn);

        imgWrap.appendChild(img);
        modal.appendChild(imgWrap);
        modal.appendChild(tip);
        modal.appendChild(actions);
        ov.appendChild(modal);
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('on'));
    },

    /* ---------- 轻量提示 ---------- */
    _toast(msg) {
        if (window.App && App.toast) { App.toast(msg); return; }
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);background:rgba(40,28,18,.82);color:#fff;padding:10px 16px;border-radius:12px;z-index:99999;font-size:14px;font-family:sans-serif;';
        document.body.appendChild(t);
        setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
    }
};
