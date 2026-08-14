/* ============================================================
   wall-export.js — 忠实裸墙 PNG（WallExport）
   ------------------------------------------------------------
   与 diary-export.js（纪念 4:5 模板）并列的另一导出方式：
   忠实还原用户在展示墙上看到的画面（WYSIWYG），输出 PNG。

   相对原 exporter.js 修复的缺口：
   ① 胶带（attachmentType:'tape'）此前因 diary-export 仅画 dataURI 固定件而被漏画
      → 现按 attachmentType 区分：tape 的 src 是「已 resolve 的相对路径」
        （assets/attachments/xxx.webp，见 wall.js _addDecor），直接采用 it.src 绘制，
        与展示墙 DOM（_resolvePolaroidSrc）完全一致，不再二次拼前缀。
        pin/button/magnet 的 src 为内联 dataURI，同样直接采用 it.src。
   ② 拍立得此前只画裸图（无相框/圆角/阴影）
      → 现按 DOM 忠实还原：自然比例照片 + 6px 圆角 + 暖色柔影
        + 1px 白内环（无额外白卡，契合当前墙视觉）。
   ③ 便签此前强制 0.66 高比，忽略 noteW/noteH
      → 现按 noteW/noteH 真实宽高还原。
   ④ 新增包围盒裁切：range='content'（默认）自动裁到内容范围；
      range='viewport' 保留完整视角（不裁切）。

   坐标模型与原代码一致（中心 (x%,y%)、rotate、scale、size=base），
   故与原墙布局严格对应。全局：WallExport。
   ============================================================ */
const WallExport = Object.assign({}, ExportShared, {

    /* 渲染整张墙画布（背景 + 全部元素），可按 range 裁切到内容范围 */
    async _renderWallToCanvas(opts) {
        opts = opts || {};
        const range = opts.range || 'content';
        if (typeof Wall === 'undefined') throw new Error('展示墙未就绪');
        Wall._load();
        const data = (Wall.data || []).slice();
        const stage = document.getElementById('wallStage');
        const sw = (stage && stage.clientWidth) || 900;
        const sh = (stage && stage.clientHeight) || 640;
        if (sw <= 0 || sh <= 0) throw new Error('展示墙尺寸异常');

        const targetW = 1440;
        const k = targetW / sw;
        const W = Math.round(targetW);
        const H = Math.round(sh * k);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        // 背景：优先展示墙当前主题背景，失败回退程序化毛毡
        const bgSrc = (typeof Wall !== 'undefined' && Wall.themeBg) || window.PAW_WALL_BG || '';
        if (bgSrc) {
            try { const bg = await this._loadImage(bgSrc); this._drawCover(ctx, bg, W, H); }
            catch (e) { this._drawFelt(ctx, W, H); }
        } else { this._drawFelt(ctx, W, H); }

        // 内容包围盒（画布坐标），用于 content 裁切
        const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

        // z 层级：照片在下，便签/贴纸居中，固定件在最上
        const zRank = { polaroid: 2, note: 3, sticker: 3, pin: 4, image: 4 };
        const items = data.map((it, i) => ({ it, i })).sort((a, b) => {
            const za = zRank[a.it.type] || 2, zb = zRank[b.it.type] || 2;
            if (za !== zb) return za - zb;
            return a.i - b.i;
        });
        for (const { it } of items) {
            try { await this._drawWallItem(ctx, it, W, H, k, bounds); }
            catch (e) { console.warn('[WallExport] 跳过元素', it.type, e && e.message); }
        }

        // 裁切到内容范围（带一点阴影余量）
        if (range === 'content' && isFinite(bounds.minX)) {
            const m = Math.round(28 * k) + 4;
            let sx = Math.max(0, Math.floor(bounds.minX - m));
            let sy = Math.max(0, Math.floor(bounds.minY - m));
            let ex = Math.min(W, Math.ceil(bounds.maxX + m));
            let ey = Math.min(H, Math.ceil(bounds.maxY + m));
            const cw = ex - sx, ch = ey - sy;
            if (cw > 0 && ch > 0 && (cw < W || ch < H)) {
                const out = document.createElement('canvas');
                out.width = cw; out.height = ch;
                out.getContext('2d').drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch);
                return out;
            }
        }
        return canvas;
    },

    /* 单个墙元素（忠实 DOM 还原）。bounds 为可选包围盒累加器 */
    async _drawWallItem(ctx, it, W, H, k, bounds) {
        const cx = W * (it.x / 100);
        const cy = H * (it.y / 100);
        const rot = (it.rotation || 0) * Math.PI / 180;
        const base = it.baseSize || (Wall.BASE && Wall.BASE[it.type]) || 120;
        const s = (it.scale || 1) * k;
        let w = base * s, h = w;

        // 把旋转后的包围盒累加到 bounds（用于 content 裁切）
        const recordBounds = (bw, bh) => {
            if (!bounds) return;
            const ex = Math.abs(bw / 2 * Math.cos(rot)) + Math.abs(bh / 2 * Math.sin(rot));
            const ey = Math.abs(bw / 2 * Math.sin(rot)) + Math.abs(bh / 2 * Math.cos(rot));
            if (cx - ex < bounds.minX) bounds.minX = cx - ex;
            if (cy - ey < bounds.minY) bounds.minY = cy - ey;
            if (cx + ex > bounds.maxX) bounds.maxX = cx + ex;
            if (cy + ey > bounds.maxY) bounds.maxY = cy + ey;
        };

        /* —— 拍立得：自然比例照片 + 圆角 + 暖影 + 1px 白内环（无额外白卡） —— */
        if (it.type === 'polaroid') {
            const src = (typeof Wall._resolvePolaroidSrc === 'function') ? Wall._resolvePolaroidSrc(it) : it.src;
            if (!src) return;
            const img = await this._loadImage(src);
            w = base * s;
            h = w * (img.height / img.width);
            recordBounds(w, h);
            const r = 6 * k;
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(rot);
            // 圆角白底撑出阴影形状（照片不透明，白底不外露）
            ctx.shadowColor = it.pinned ? 'rgba(90,60,30,0.30)' : 'rgba(120,80,40,0.20)';
            ctx.shadowBlur = it.pinned ? 13 * k : 22 * k;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = it.pinned ? 6 * k : 10 * k;
            this._roundRect(ctx, -w / 2, -h / 2, w, h, r);
            ctx.fillStyle = '#ffffff'; ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.save();
            this._roundRect(ctx, -w / 2, -h / 2, w, h, r);
            ctx.clip();
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
            // 1px 白内环（模仿 DOM inset 0 0 0 1px rgba(255,255,255,.55)）
            ctx.lineWidth = Math.max(1, 1 * k);
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            this._roundRect(ctx, -w / 2, -h / 2, w, h, r);
            ctx.stroke();
            ctx.restore();
            return;
        }

        /* —— 便签：按 noteW/noteH 真实宽高 + 文字 —— */
        if (it.type === 'note') {
            w = (it.noteW || 1) * base * s;
            h = (it.noteH || 1) * base * s;
            recordBounds(w, h);
            const colors = { cream: '#fff7ea', yellow: '#fff0bf', pink: '#ffe3ec' };
            const fill = colors[it.color] || colors.cream;
            const r = 10 * k;
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.shadowColor = 'rgba(120,80,40,0.18)'; ctx.shadowBlur = 20 * k; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 10 * k;
            this._roundRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fillStyle = fill; ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = Math.max(1, 1 * k); ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            this._roundRect(ctx, -w / 2, -h / 2, w, h, r); ctx.stroke();
            const pad = 16 * k;
            ctx.fillStyle = '#6D4A33'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.font = `${Math.round(15 * k)}px ${this._kanjiFont}`;
            const txt = (it.text && it.text.trim()) ? it.text : '点我写点什么…';
            const lines = this._wrapText(ctx, txt, w - pad * 2);
            const lh = 15 * k * 1.55;
            let ty = -h / 2 + 14 * k;
            for (const ln of lines) { ctx.fillText(ln, -w / 2 + pad, ty); ty += lh; if (ty > h / 2 - pad) break; }
            ctx.restore();
            return;
        }

        /* —— 贴纸：自然比例（透明背景，不裁切以保造型） —— */
        if (it.type === 'sticker') {
            const src = this._resolveStickerSrc(it);
            if (!src) return;
            const img = await this._loadImage(src);
            w = base * s; h = w * (img.height / img.width);
            recordBounds(w, h);
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.shadowColor = 'rgba(120,80,40,0.18)'; ctx.shadowBlur = 6 * k; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4 * k;
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
            return;
        }

        /* —— 固定装饰（图钉/纽扣/磁铁/胶带）：type 为 pin 或 image —— */
        if (it.type === 'pin' || it.type === 'image') {
            const att = it.attachmentType;
            // 真实墙数据（见 wall.js _resolvePolaroidSrc / _addDecor）：
            //  - 图钉/纽扣/磁铁 src 是内联 SVG dataURI，可直接用作 <img src>；
            //  - 胶带 src 是「已 resolve」的相对路径（assets/attachments/xxx.webp），
            //    同样可直接用作 <img src>，无需再拼前缀。
            // 故与展示墙 DOM 保持一致：直接采用 it.src，绝不能二次 ASSET_CONFIG.resolve
            // （否则 tape 全路径会被拼成 assets/assets/… 导致加载失败、胶带漏画）。
            let src = it.src;
            if (!src) return;
            const img = await this._loadImage(src);
            w = base * s; h = w * (img.height / img.width);
            recordBounds(w, h);
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(rot);
            if (att === 'tape') {
                // 胶带是平贴物件，给一点柔和投影更贴墙
                ctx.shadowColor = 'rgba(120,80,40,0.16)'; ctx.shadowBlur = 8 * k; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4 * k;
            }
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
            return;
        }
    },

    /* 对外入口：冲洗仪式 → 忠实裸墙 PNG → 保存 */
    async export(opts) {
        opts = opts || {};
        try {
            if (typeof Wall === 'undefined') { this._warn('展示墙尚未就绪'); return; }
            const wallCanvas = await this._renderWallToCanvas(opts);

            await DevelopAnimation.run(wallCanvas, { mode: 'wall', done: '这份回忆已经冲洗完成 🐾' });

            const d = new Date();
            const p = n => String(n).padStart(2, '0');
            const tag = opts.range === 'viewport' ? 'fullwall' : 'wall';
            const fname = `pawlaroid-${tag}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
            await this._finish(wallCanvas, fname);
        } catch (e) {
            console.warn('[WallExport] 导出失败', e);
            this._warn('展示墙导出失败，请重试 🐾');
        }
    }
});
