/* ============================================================
   diary-export.js — 纪念长图 + 时光机长图（Exporter）
   ------------------------------------------------------------
   继承 ExportShared（共享工具），原封保留：
   - exportWall()        展示墙 → 4:5 纪念模板（顶部信息/中部墙面/
                          底部留言编号）。
   - exportTimeMachine() 时光机 → 宠物成长日记长图。
   _renderWallToCanvas / _drawWallItem 维持原样（含原有行为），
   以“原封保留”纪念长图之承诺；忠实裸墙 PNG 见 wall-export.js。
   全局：Exporter。
   ============================================================ */
const Exporter = Object.assign({}, ExportShared, {

    /* ============================================================
       一、展示墙：渲染整张墙画布（背景 + 全部元素 + 阴影）
       ============================================================ */
    async _renderWallToCanvas() {
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

        const bgSrc = (typeof Wall !== 'undefined' && Wall.themeBg) || window.PAW_WALL_BG || '';
        if (bgSrc) {
            try { const bg = await this._loadImage(bgSrc); this._drawCover(ctx, bg, W, H); }
            catch (e) { this._drawFelt(ctx, W, H); }
        } else { this._drawFelt(ctx, W, H); }

        const zRank = { polaroid: 2, note: 3, sticker: 3, pin: 4 };
        const items = data.map((it, i) => ({ it, i })).sort((a, b) => {
            const za = zRank[a.it.type] || 2, zb = zRank[b.it.type] || 2;
            if (za !== zb) return za - zb;
            return a.i - b.i;
        });
        for (const { it } of items) {
            try { await this._drawWallItem(ctx, it, W, H, k); }
            catch (e) { console.warn('[Exporter] 跳过元素', it.type, e && e.message); }
        }
        return canvas;
    },

    async _drawWallItem(ctx, it, W, H, k) {
        const cx = W * (it.x / 100);
        const cy = H * (it.y / 100);
        const rot = (it.rotation || 0) * Math.PI / 180;
        const base = it.baseSize || (Wall.BASE && Wall.BASE[it.type]) || 120;
        const s = (it.scale || 1) * k;
        const SH_C = 'rgba(120,80,40,0.22)';
        const SH_B = 18 * k, SH_Y = 9 * k;

        if (it.type === 'polaroid') {
            const src = (typeof Wall._resolvePolaroidSrc === 'function') ? Wall._resolvePolaroidSrc(it) : it.src;
            if (!src) return;
            const img = await this._loadImage(src);
            const w = base * s;
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.shadowColor = SH_C; ctx.shadowBlur = SH_B; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = SH_Y;
            ctx.drawImage(img, -w / 2, -w / 2, w, w);
            ctx.restore();
            return;
        }
        if (it.type === 'note') {
            const w = base * s, h = w * 0.66;
            const colors = { cream: '#fff7ea', yellow: '#fff0bf', pink: '#ffe3ec' };
            const fill = colors[it.color] || colors.cream;
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.shadowColor = SH_C; ctx.shadowBlur = SH_B; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = SH_Y;
            this._roundRect(ctx, -w / 2, -h / 2, w, h, 10 * k);
            ctx.fillStyle = fill; ctx.fill();
            ctx.shadowColor = 'transparent';
            const pad = 14 * k;
            ctx.fillStyle = '#6D4A33';
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.font = `${Math.round(15 * k)}px ${this._kanjiFont}`;
            const txt = (it.text && it.text.trim()) ? it.text : '点我写点什么…';
            const lines = this._wrapText(ctx, txt, w - pad * 2);
            const lh = 15 * k * 1.55;
            let ty = -h / 2 + pad;
            for (const ln of lines) { ctx.fillText(ln, -w / 2 + pad, ty); ty += lh; if (ty > h / 2 - pad) break; }
            ctx.restore();
            return;
        }
        if (it.type === 'sticker') {
            const src = this._resolveStickerSrc(it);
            if (!src) return;
            const img = await this._loadImage(src);
            const w = base * s, h = w * (img.height / img.width);
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.shadowColor = 'rgba(120,80,40,0.18)'; ctx.shadowBlur = 6 * k; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4 * k;
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
            return;
        }
        if (it.type === 'pin') {
            const src = it.src;
            if (!src || String(src).indexOf('data:') !== 0) return;
            const img = await this._loadImage(src);
            const w = base * s, h = w * (img.height / img.width);
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
            return;
        }
    },

    /* ============================================================
       二、展示墙导出：冲洗仪式 → 4:5 纪念模板
       ============================================================ */
    async exportWall() {
        try {
            if (typeof Wall === 'undefined') { this._warn('展示墙尚未就绪'); return; }
            const wallCanvas = await this._renderWallToCanvas();

            await DevelopAnimation.run(wallCanvas, { mode: 'wall', done: '这份回忆已经冲洗完成 🐾' });

            const tmpl = this._composeWallTemplate(wallCanvas);
            const d = new Date();
            const p = n => String(n).padStart(2, '0');
            const fname = `pawlaroid-wall-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
            await this._finish(tmpl, fname);
        } catch (e) {
            console.warn('[Exporter] 展示墙冲洗失败', e);
            this._warn('回忆墙冲洗失败，请重试 🐾');
        }
    },

    /* 4:5 纪念模板：顶部信息 / 中部墙面 / 底部留言+编号 */
    _composeWallTemplate(wallCanvas) {
        const W = 1080, H = 1350;               // 4:5
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        // 底：米白手帐 + 淡点
        ctx.fillStyle = '#FBF6EC'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(200,160,110,0.10)';
        for (let gy = 30; gy < H; gy += 40) for (let gx = 30; gx < W; gx += 40) { ctx.beginPath(); ctx.arc(gx, gy, 1.5, 0, Math.PI * 2); ctx.fill(); }

        const name = this._petName();
        const title = name ? `${name} 的回忆墙` : '我的回忆墙';
        const dateStr = this._shotDate();
        const no = this._exportNo();

        // —— 顶部信息区 ——
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f0a45c';
        ctx.font = `600 30px ${this._sansCNFont}`;
        ctx.fillText('Pawlaroid', W / 2, 72);
        ctx.strokeStyle = 'rgba(255,164,92,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(360, 92); ctx.lineTo(W - 360, 92); ctx.stroke();
        ctx.fillStyle = '#6D4A33';
        ctx.font = `700 56px ${this._sansCNFont}`;
        ctx.fillText(title, W / 2, 158);
        ctx.fillStyle = '#b08a5e';
        ctx.font = `400 28px ${this._sansCNFont}`;
        const sub = dateStr ? `${dateStr}` : '';
        ctx.fillText(sub, W / 2, 206);
        ctx.font = `500 22px ${this._sansCNFont}`;
        ctx.fillStyle = '#caa06a';
        ctx.fillText(no.text, W / 2, 244);

        // —— 中部：展示墙图片 ——
        const P = 64;
        const regionX = P, regionY = 300, regionW = W - 2 * P, regionH = 940;
        const wr = wallCanvas.width / wallCanvas.height;
        let dw = regionW, dh = regionW / wr;
        if (dh > regionH) { dh = regionH; dw = regionH * wr; }
        const dx = regionX + (regionW - dw) / 2;
        const dy = regionY + (regionH - dh) / 2;
        const pad = 16;
        ctx.save();
        ctx.shadowColor = 'rgba(141,92,47,0.28)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
        this._roundRect(ctx, dx - pad, dy - pad, dw + pad * 2, dh + pad * 2, 18);
        ctx.fillStyle = '#FFFFFF'; ctx.fill();
        ctx.restore();
        this._roundRect(ctx, dx, dy, dw, dh, 8);
        ctx.save(); ctx.clip();
        ctx.drawImage(wallCanvas, dx, dy, dw, dh);
        ctx.restore();

        // —— 底部：留言 + 品牌 ——
        let msg = '';
        if (typeof PawMemory !== 'undefined') {
            const all = PawMemory.all().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            const last = all[0];
            msg = (last && (last.title || last.text || last.petName))
    ? (last.title || last.text || `和 ${last.petName} 的这一天`)
    : '';
        }
        if (!msg) msg = '今天也要开心呀';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6D4A33';
        ctx.font = `italic 600 34px ${this._kanjiFont}`;
        ctx.fillText('“' + msg + '”', W / 2, 1290);
        ctx.fillStyle = '#b08a5e';
        ctx.font = `400 22px ${this._sansCNFont}`;
        ctx.fillText('Pawlaroid · 把数字回忆冲洗成纪念 🐾', W / 2, 1326);

        return canvas;
    },

    /* ============================================================
       三、时光机导出：宠物成长日记长图
       ============================================================ */
    async exportTimeMachine() {
        try {
            if (typeof PawMemory === 'undefined') { this._warn('时光机尚未就绪'); return; }
            const canvas = await this._renderTimelineToCanvas();
            await DevelopAnimation.run(canvas, { mode: 'timeline', done: '宠物日记已经做好啦 🐾' });
            const d = new Date();
            const p = n => String(n).padStart(2, '0');
            const fname = `pawlaroid-diary-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
            await this._finish(canvas, fname);
        } catch (e) {
            console.warn('[Exporter] 时光机导出失败', e);
            this._warn('宠物日记导出失败，请重试 🐾');
        }
    },

    /* ============================================================
       宠物回忆手帐页（1080 宽竖版，小红书友好）
       ============================================================ */
    async _renderTimelineToCanvas() {
        const list = PawMemory.all().slice();
        if (!list.length) { this._warn('还没有回忆可以导出哦 🐾'); throw new Error('empty'); }
        if (window.App && App.toast) App.toast('正在冲洗宠物日记…🐾');

        list.sort((a, b) => {
            const da = Date.parse(a.date) || 0, db = Date.parse(b.date) || 0;
            if (da !== db) return da - db;
            return (a.createdAt || 0) - (b.createdAt || 0);
        });

        const W = 1080, P = 76, CW = W - 2 * P;
        const name = this._petName();
        const title = name ? `${name}的时光机` : '我的时光机';

        const warmText = [title]
            .concat(list.map(r => this._resolveTitle(r)))
            .concat(list.map(r => (Array.isArray(r.note) ? r.note.join('') : (r.note || ''))))
            .concat(list.map(r => (Array.isArray(r.tags) ? r.tags.join('') : '')))
            .join('');
        await this._ensureFonts(warmText);

        const hand = (sz) => `${Math.round(sz)}px ${this._handFont}`;
        const memo = (sz) => `${Math.round(sz)}px ${this._memoFont}`;
        const enF = (sz) => `${Math.round(sz)}px ${this._enFont}`;
        const cute = (sz) => `${Math.round(sz)}px ${this._cuteFont}`;

        const measure = document.createElement('canvas').getContext('2d');
        const rnd = this._seedRand(list.length * 7919 + (name ? name.length * 131 : 37));

        const HEAD_H = 356;
        const PHOTO_W = 604, TILT_PAD = 34;
        const GAP_DATE = 22, GAP_PHOTO = 32, GAP_CAP = 26, GAP_NOTE = 24, GAP_TAG = 18, GAP_ENTRY = 84;
        const TAG_H = 58, TAG_GAP = 16, TAG_ROW_GAP = 14;
        const MEMO_PAD = 44, MEMO_INDENT = 38;
        const showEntryDate = list.length > 1;

        const blocks = [];
        let y = HEAD_H;

        for (const rec of list) {
            const blk = { rec };

            blk.dateCn = this._formatDate(rec.date, 'cn');
            blk.week = this._weekCn(rec.date);
            blk.showDate = showEntryDate;
            blk.dateH = showEntryDate ? 64 : 0;
            if (showEntryDate) y += blk.dateH + GAP_DATE;

            let img = null;
            try { img = await this._loadImage(rec.image); } catch (e) { img = null; }
            blk.img = img;
            blk.photoW = PHOTO_W;
            blk.photoH = Math.round(PHOTO_W * (img ? (img.height / img.width) : 1.134));
            blk.tilt = (rnd() * 2.6 - 1.3);
            y += blk.photoH + TILT_PAD + GAP_PHOTO;

            const cap = this._resolveTitle(rec);
            measure.font = hand(42);
            blk.capLines = this._wrapText(measure, cap, CW - 90);
            blk.capH = blk.capLines.length * 42 * 1.5;
            y += blk.capH + GAP_CAP;

            const noteArr = Array.isArray(rec.note)
                ? rec.note.map(n => String(n == null ? '' : n).trim()).filter(Boolean)
                : (rec.note ? [String(rec.note).trim()] : []);
            if (noteArr.length) {
                blk.memoW = CW - 26;
                blk.memoLineH = Math.round(32 * 1.72);
                measure.font = memo(32);
                blk.memoItems = noteArr.map(n =>
                    this._wrapText(measure, n, blk.memoW - MEMO_PAD * 2 - MEMO_INDENT));
                blk.memoLineCount = blk.memoItems.reduce((s, ls) => s + ls.length, 0);
                blk.memoH = 96 + blk.memoLineCount * blk.memoLineH + 38;
                blk.memoTilt = (rnd() * 1.8 - 0.9);
                y += blk.memoH + GAP_NOTE;
            }

            const tags = (Array.isArray(rec.tags) ? rec.tags : [])
                .map(t => String(t == null ? '' : t).trim()).filter(Boolean);
            if (tags.length) {
                measure.font = cute(28);
                const rows = [];
                let row = [], rowW = 0;
                for (const t of tags) {
                    const label = this._tagEmoji(t) + ' ' + t;
                    const cw = Math.ceil(measure.measureText(label).width) + 54;
                    if (row.length && rowW + TAG_GAP + cw > CW) { rows.push({ chips: row, w: rowW }); row = []; rowW = 0; }
                    rowW += (row.length ? TAG_GAP : 0) + cw;
                    row.push({ text: label, w: cw });
                }
                if (row.length) rows.push({ chips: row, w: rowW });
                blk.tagRows = rows;
                blk.tagH = rows.length * TAG_H + (rows.length - 1) * TAG_ROW_GAP;
                y += GAP_TAG + blk.tagH;
            }

            y += GAP_ENTRY;
            blocks.push(blk);                     // ★ 两阶段渲染：每轮末尾必须 push
        }

        const FOOT_H = 150;
        const contentH = Math.ceil(y + FOOT_H);
        const totalH = Math.max(contentH, 1440);

        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = totalH;
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'alphabetic';

        this._drawJournalPaper(ctx, W, totalH, rnd);

        for (let i = 0; i < 7; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const px = W / 2 + side * (W / 2 - 36) + (rnd() * 18 - 9);
            const py = 420 + rnd() * Math.max(120, totalH - 580);
            this._drawPaw(ctx, px, py, 0.85 + rnd() * 0.5, rnd() * 360, 'rgba(200,158,110,0.20)');
        }

        this._drawTape(ctx, 92, 34, 210, 56, -26, 'cream');
        this._drawTape(ctx, W - 92, 34, 210, 56, 26, 'pink');

        ctx.textAlign = 'center';
        ctx.fillStyle = '#6D4A33';
        ctx.font = hand(68);
        ctx.fillText(title, W / 2, 152);
        const tw = Math.min(CW, ctx.measureText(title).width);
        this._drawWave(ctx, W / 2 - tw / 2 - 12, W / 2 + tw / 2 + 12, 180, 3.2, 'rgba(240,164,92,0.72)', 4);

        ctx.fillStyle = '#C9A06A';
        ctx.font = enF(38);
        ctx.fillText('Time Machine', W / 2, 232);

        const firstISO = list[0].date, lastISO = list[list.length - 1].date;
        const sameDay = this._formatDate(firstISO, 'cn') === this._formatDate(lastISO, 'cn');
        const dateCn = sameDay
            ? this._formatDate(lastISO, 'cn')
            : `${this._formatDate(firstISO, 'cn')} — ${this._formatDate(lastISO, 'cn')}`;
        const dateEn = sameDay ? this._formatDateEn(lastISO) : '';
        ctx.fillStyle = '#8D6B4B';
        ctx.font = hand(34);
        ctx.fillText(dateCn, W / 2, 288);
        if (dateEn) {
            ctx.fillStyle = '#C9A06A';
            ctx.font = enF(28);
            ctx.fillText(dateEn, W / 2, 324);
        }

        let cy = HEAD_H;
        for (let bi = 0; bi < blocks.length; bi++) {
            const blk = blocks[bi];

            if (blk.showDate) {
                const dtxt = blk.week ? `${blk.dateCn} ${blk.week}` : blk.dateCn;
                ctx.font = hand(34);
                const dw = ctx.measureText(dtxt).width;
                this._drawTape(ctx, W / 2, cy + 30, Math.min(CW, dw + 108), 50, -1.2, 'cream');
                ctx.fillStyle = '#8A6540';
                ctx.textAlign = 'center';
                ctx.font = hand(34);
                ctx.fillText(dtxt, W / 2, cy + 42);
                this._drawPaw(ctx, W / 2 - Math.min(CW, dw + 108) / 2 + 26, cy + 30, 0.95, -16, 'rgba(180,130,80,0.5)');
                cy += blk.dateH + GAP_DATE;
            }

            if (blk.img) {
                const px = (W - blk.photoW) / 2;
                const py = cy + TILT_PAD / 2;
                const rad = blk.tilt * Math.PI / 180;
                ctx.save();
                ctx.translate(px + blk.photoW / 2, py + blk.photoH / 2);
                ctx.rotate(rad);
                ctx.shadowColor = 'rgba(141,92,47,0.28)';
                ctx.shadowBlur = 28; ctx.shadowOffsetY = 13;
                ctx.drawImage(blk.img, -blk.photoW / 2, -blk.photoH / 2, blk.photoW, blk.photoH);
                ctx.restore();
                const corner = (sx) => {
                    const lx = sx * blk.photoW / 2, ly = -blk.photoH / 2;
                    return {
                        x: px + blk.photoW / 2 + lx * Math.cos(rad) - ly * Math.sin(rad),
                        y: py + blk.photoH / 2 + lx * Math.sin(rad) + ly * Math.cos(rad)
                    };
                };
                const c1 = corner(-1), c2 = corner(1);
                this._drawTape(ctx, c1.x, c1.y, 152, 46, -42 + blk.tilt, 'mint');
                this._drawTape(ctx, c2.x, c2.y, 152, 46, 42 + blk.tilt, 'sky');
            }
            cy += blk.photoH + TILT_PAD + GAP_PHOTO;

            ctx.textAlign = 'center';
            ctx.fillStyle = '#6D4A33';
            ctx.font = hand(42);
            let my = cy + 40;
            for (const ln of blk.capLines) { ctx.fillText(ln, W / 2, my); my += 42 * 1.5; }
            cy += blk.capH + GAP_CAP;

            if (blk.memoItems) {
                const mx = (W - blk.memoW) / 2;
                ctx.save();
                ctx.translate(mx + blk.memoW / 2, cy + blk.memoH / 2);
                ctx.rotate(blk.memoTilt * Math.PI / 180);
                this._drawMemoShape(ctx, blk.memoW, blk.memoH, 96, blk.memoLineH, blk.memoLineCount);
                const L = -blk.memoW / 2, T = -blk.memoH / 2;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillStyle = '#C08A4A';
                ctx.font = cute(26);
                ctx.fillText('今日小记', L + MEMO_PAD + 34, T + 36);
                this._drawPaw(ctx, L + MEMO_PAD + 14, T + 50, 0.85, -14, 'rgba(200,150,90,0.65)');
                ctx.fillStyle = '#6D4A33';
                ctx.font = memo(32);
                let ty = T + 96;
                for (const lines of blk.memoItems) {
                    for (let li = 0; li < lines.length; li++) {
                        if (li === 0) {
                            ctx.fillStyle = 'rgba(200,150,90,0.85)';
                            ctx.fillText('·', L + MEMO_PAD + 6, ty);
                            ctx.fillStyle = '#6D4A33';
                        }
                        ctx.fillText(lines[li], L + MEMO_PAD + MEMO_INDENT, ty);
                        ty += blk.memoLineH;
                    }
                }
                ctx.textBaseline = 'alphabetic';
                ctx.restore();
                this._drawTape(ctx, mx + 96, cy + 4, 128, 40, -4 + blk.memoTilt, 'cream');
                cy += blk.memoH + GAP_NOTE;
            }

            if (blk.tagRows) {
                cy += GAP_TAG;
                ctx.font = cute(28);
                for (const row of blk.tagRows) {
                    let tx = (W - row.w) / 2;
                    for (const chip of row.chips) {
                        ctx.save();
                        ctx.shadowColor = 'rgba(180,130,70,0.16)';
                        ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
                        this._roundRect(ctx, tx, cy, chip.w, TAG_H, TAG_H / 2);
                        ctx.fillStyle = '#FFEEDA';
                        ctx.fill();
                        ctx.restore();
                        ctx.fillStyle = '#B4753A';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.font = cute(28);
                        ctx.fillText(chip.text, tx + chip.w / 2, cy + TAG_H / 2 + 2);
                        ctx.textBaseline = 'alphabetic';
                        tx += chip.w + TAG_GAP;
                    }
                    cy += TAG_H + TAG_ROW_GAP;
                }
                cy -= TAG_ROW_GAP;
            }

            if (bi < blocks.length - 1) {
                const dy = cy + GAP_ENTRY / 2;
                this._drawWave(ctx, W / 2 - 130, W / 2 - 30, dy, 2.4, 'rgba(214,180,130,0.75)', 2.5);
                this._drawWave(ctx, W / 2 + 30, W / 2 + 130, dy, 2.4, 'rgba(214,180,130,0.75)', 2.5);
                this._drawPaw(ctx, W / 2, dy - 2, 1.0, 0, 'rgba(214,175,120,0.8)');
            }
            cy += GAP_ENTRY;
        }

        const fy = Math.max(cy + 46, totalH - 92);
        this._drawWave(ctx, W / 2 - 120, W / 2 + 120, fy - 52, 2.6, 'rgba(240,164,92,0.48)', 3);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#F0A45C';
        ctx.font = enF(42);
        ctx.fillText('Pawlaroid', W / 2, fy);
        ctx.fillStyle = '#B08A5E';
        ctx.font = hand(27);
        ctx.fillText(`共 ${list.length} 段回忆 · 把数字回忆冲洗成纪念 🐾`, W / 2, fy + 42);

        return canvas;
    }
});
