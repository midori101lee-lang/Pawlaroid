/* ============================================================
   exporter.js — 回忆冲洗系统（Memory Developing & Export）
   ------------------------------------------------------------
   核心理念：用户不是导出一张图片，而是把数字宠物回忆“冲洗成
   一份纪念品”。点击按钮 → 冲洗仪式（快门/聚合/显影）→ 生成带
   纪念模板的图片 → 保存。

   组件（均在本文件内，零依赖、file:// 友好）：
   - DevelopAnimation：冲洗仪式（快门闪光 + 页面震动 + 合成咔嚓声
     + 展示墙元素聚合 + 相纸显影 blur→clear + 完成提示）。
   - Exporter：
       exportWall()        展示墙 → 4:5 纪念模板（顶部信息/中部墙面/
                          底部留言编号）。
       exportTimeMachine() 时光机 → 宠物成长日记长图。

   硬约束遵守：
   - 绘制资源：仓库公开版（http 同源）走相对路径（window.PAW_WALL_BG /
     记忆图 / 图钉SVG / window.PAW_STICKER_DATAURI），由
     js/assets-export.js 经 assetConfig 解析；
     本地完整副本（file://）下这些键改为内联 dataURI，避免本地图片
     路径污染 canvas 抛 SecurityError。
   - 读取统一数据源：展示墙布局读 Wall.data，拍立得按 memoryId 从
     PawMemory 取；时光机读 PawMemory.all()。绝不读页面临时变量。
   - 不修改拍立得生成 / 相纸选择 / 展示墙编辑 / 时光机存储，
     仅新增导出模块。
   ============================================================ */

/* ============================================================
   冲洗仪式组件（DevelopAnimation）
   ============================================================ */
const DevelopAnimation = {
    /* 播放合成“咔嚓”快门声（无外部音效系统，用 WebAudio 即时合成） */
    _shutter() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const t = ctx.currentTime;
            // 机械咔嚓：高频短促 + 低频“咔”两声
            const mk = (freq, dur, vol, type) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = type || 'square';
                o.frequency.setValueAtTime(freq, t);
                o.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.4), t + dur);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
                g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                o.connect(g); g.connect(ctx.destination);
                o.start(t); o.stop(t + dur + 0.02);
            };
            mk(1500, 0.05, 0.18, 'square');
            mk(380, 0.09, 0.22, 'triangle');
            setTimeout(() => mk(900, 0.04, 0.12, 'square'), 70);
            setTimeout(() => { try { ctx.close(); } catch (e) {} }, 400);
        } catch (e) { /* 静音也无所谓 */ }
    },

    /* 主流程：传入已经渲染好的画布（dataURI 安全），播放仪式后 resolve */
    run(canvas, opts) {
        opts = opts || {};
        const mode = opts.mode || 'wall';          // wall | timeline
        const finalCaption = opts.done || '这份回忆已经冲洗完成 🐾';
        const wait = (ms) => new Promise(r => setTimeout(r, ms));

        return new Promise(async (resolve) => {
            let dataURL = '';
            try { dataURL = canvas.toDataURL('image/png'); } catch (e) {}

            // 覆盖层 DOM（动态创建，避免改动 index.html 结构）
            const ov = document.createElement('div');
            ov.id = 'developOverlay';
            ov.innerHTML =
                '<div class="dev-flash"></div>' +
                '<div class="dev-stage">' +
                '  <div class="dev-photo">' +
                '    <img class="dev-img" alt="developing" />' +
                '    <div class="dev-badge">Pawlaroid</div>' +
                '  </div>' +
                '  <div class="dev-caption"></div>' +
                '</div>';
            document.body.appendChild(ov);
            const img = ov.querySelector('.dev-img');
            const cap = ov.querySelector('.dev-caption');
            if (img && dataURL) img.src = dataURL;
            if (cap) cap.textContent = '准备冲洗…🐾';

            // 进入淡入
            requestAnimationFrame(() => ov.classList.add('on'));

            // Step 1：快门（闪光 + 震动 + 咔嚓）
            this._shutter();
            document.body.classList.add('dev-shake');
            const flash = ov.querySelector('.dev-flash');
            if (flash) { flash.classList.add('go'); }
            setTimeout(() => document.body.classList.remove('dev-shake'), 480);

            // Step 2：展示墙元素聚合到中心（仅 wall 模式，作用在真实墙 DOM）
            let stage = null;
            if (mode === 'wall') {
                stage = document.getElementById('wallStage');
                if (stage) stage.classList.add('developing');
            }

            await wait(520);
            if (cap) cap.textContent = '正在冲洗…🐾';
            // Step 3：相纸显影（blur → clear）
            const photo = ov.querySelector('.dev-photo');
            if (photo) photo.classList.add('show');

            await wait(1350);
            // Step 4：完成提示
            if (cap) cap.textContent = finalCaption;
            await wait(950);

            // 清理
            if (stage) stage.classList.remove('developing');
            ov.classList.remove('on');
            setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 320);
            resolve(true);
        });
    }
};

/* ============================================================
   导出主模块（Exporter）
   ============================================================ */
const Exporter = {
    /* ---------- 通用工具 ---------- */
    _basename(src) {
        if (!src) return '';
        const m = /([^/\\]+)$/.exec(src);
        return m ? m[1] : '';
    },

    _loadImage(src) {
        return new Promise((resolve, reject) => {
            if (!src) return reject(new Error('empty src'));
            const img = new Image();
            // 同源 assets，无需 crossOrigin
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('load fail'));
            img.src = src;
        });
    },

    _roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    },

    _wrapText(ctx, text, maxW) {
        const lines = [];
        const paras = String(text == null ? '' : text).split('\n');
        for (const para of paras) {
            if (para === '') { lines.push(''); continue; }
            let line = '';
            for (const ch of para) {
                const test = line + ch;
                if (ctx.measureText(test).width > maxW && line) {
                    lines.push(line); line = ch;
                } else { line = test; }
            }
            if (line) lines.push(line);
        }
        return lines;
    },

    /* 触发保存：移动端优先“保存到相册”（Web Share / 长按兜底），
       桌面回退直接下载。统一走 MobileSave 模块。 */
    _finish(canvas, filename) {
        if (typeof MobileSave !== 'undefined') {
            return MobileSave.save(canvas, filename);
        }
        // 兜底：直接下载（MobileSave 不可用时的最后防线）
        try {
            const dataURL = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataURL; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            if (window.App && App.toast) App.toast('回忆已经保存🐾');
            return Promise.resolve(true);
        } catch (e) { return Promise.reject(e); }
    },

    _resolveStickerSrc(it) {
        // 已内联（data URI）直接可用
        if (it.src && String(it.src).indexOf('data:') === 0) return it.src;
        // 配置驱动：按 decorId / src 文件名反查 assets/config/stickers.json
        const list = (window.AssetManager ? AssetManager.get('stickers') : []);
        const pick = (s) => (s ? AssetManager.resolve(s.image) : '');
        if (it.decorId) {
            const s = list.find(x => x.id === it.decorId);
            if (s) return pick(s);
        }
        if (it.src) {
            const base = this._basename(it.src);
            const s = list.find(x => x.id === base || this._basename(x.image) === base);
            if (s) return pick(s);
        }
        // 历史兜底：assets-export.js 注入的 PAW_STICKER_DATAURI（收口阶段可移除）
        const map = window.PAW_STICKER_DATAURI || {};
        return (it.decorId && map[it.decorId]) || (it.src && map[this._basename(it.src)]) || '';
    },

    _petName() {
        let name = (window.App && App.state && App.state.petName) || '';
        if (!name) {
            try { const p = JSON.parse(localStorage.getItem('pawlaroid_pet') || '{}'); name = p.petName || ''; } catch (e) {}
        }
        if (!name && typeof PawMemory !== 'undefined') {
            const cnt = {};
            PawMemory.all().forEach(r => { const n = (r.petName || '').trim(); if (n) cnt[n] = (cnt[n] || 0) + 1; });
            let best = '', b = 0;
            Object.keys(cnt).forEach(k => { if (cnt[k] > b) { b = cnt[k]; best = k; } });
            name = best;
        }
        return name ? name.trim() : '';
    },

    _formatDate(iso, style) {
        const d = iso ? new Date(iso) : new Date();
        if (isNaN(d.getTime())) return style === 'cn' ? '未注明日期' : '';
        const p = n => (n < 10 ? '0' + n : '' + n);
        if (style === 'cn') return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
    },

    /* 拍立得编号：按冲洗次数递增（localStorage 持久） */
    _exportNo() {
        let n = 1;
        try { n = (parseInt(localStorage.getItem('pawlaroid_export_seq') || '0', 10) || 0) + 1; localStorage.setItem('pawlaroid_export_seq', String(n)); } catch (e) {}
        const s = ('00' + n).slice(-3);
        return { num: n, text: 'PAWLAROID #' + s };
    },

    /* 取“拍摄日期”：优先最新一条记忆的日期，否则今天 */
    _shotDate() {
        let iso = '';
        if (typeof PawMemory !== 'undefined') {
            const all = PawMemory.all().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            iso = (all[0] && all[0].date) || '';
        }
        return this._formatDate(iso || null, 'dot');
    },

    /* ============================================================
       一、展示墙：渲染整张墙画布（背景 + 全部元素 + 阴影）
       ============================================================ */
    _resolveTitle(rec) {
        // 用户在卡片上编辑的是 title，所以导出优先读 title；老数据没有 title 时回退到 text，再回退到占位文案。
        const t = (rec && rec.title && rec.title.trim()) ||
                  (rec && rec.text && rec.text.trim()) || '';
        return t || (rec && rec.petName ? `和 ${rec.petName} 的这一天` : '日常陪伴');
    },
    /* 跨平台中文手帐风字体栈：在 macOS 优先 STKaiti / Kaiti（楷体感），
       Windows 回退到 SimSun / KaiTi，Linux 回退到 Noto Serif CJK SC，最后 serif。
       这样无论在哪台机器导出/查看，字体观感都接近温暖的楷体而不是冷冰冰的 sans-serif。 */
    _kanjiFont: '"STKaiti","Kaiti","KaiTi","STSong","SimSun","Songti SC","Noto Serif CJK SC",serif',
    _sansCNFont: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif',

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

        // 背景：优先使用展示墙当前主题背景（Wall.themeBg / window.PAW_WALL_BG，由 wall.js 按主题注入），
        // 失败则回退默认背景，再回退程序化毛毡色块，保证导出永不空白。
        const bgSrc = (typeof Wall !== 'undefined' && Wall.themeBg) || window.PAW_WALL_BG || '';
        if (bgSrc) {
            try { const bg = await this._loadImage(bgSrc); this._drawCover(ctx, bg, W, H); }
            catch (e) { this._drawFelt(ctx, W, H); }
        } else { this._drawFelt(ctx, W, H); }

        // 元素按 z 层级
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

    _drawCover(ctx, img, W, H) {
        const ir = img.width / img.height, tr = W / H;
        let dw, dh, dx, dy;
        if (ir > tr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
        else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
        ctx.drawImage(img, dx, dy, dw, dh);
    },

    _drawFelt(ctx, W, H) {
        ctx.fillStyle = '#f3e3c8'; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(141,92,47,0.10)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
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
        // 分隔线
        ctx.strokeStyle = 'rgba(255,164,92,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(360, 92); ctx.lineTo(W - 360, 92); ctx.stroke();
        // 宠物名（大标题）
        ctx.fillStyle = '#6D4A33';
        ctx.font = `700 56px ${this._sansCNFont}`;
        ctx.fillText(title, W / 2, 158);
        // 日期 + 编号
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
        // 白色相纸边框 + 阴影
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

    /* ---------- 手帐字体（项目自托管：Ma Shan Zheng / Long Cang / Caveat / ZCOOL KuaiLe） ---------- */
    _handFont: '"Ma Shan Zheng","Long Cang","STKaiti","Kaiti","KaiTi",cursive,serif',
    _memoFont: '"Long Cang","Ma Shan Zheng","STKaiti","Kaiti","KaiTi",cursive,serif',
    _enFont: '"Caveat","Snell Roundhand","Segoe Script","Ma Shan Zheng",cursive',
    _cuteFont: '"ZCOOL KuaiLe","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',

    /* canvas 不会自动触发 webfont 下载（字体按 unicode-range 分成 281 个分片），
       必须先用真实文案 document.fonts.load 预热，否则导出会静默回退到系统字体，
       手写手帐风瞬间变回扁平网页感。加 2.5s 上限避免网络慢时卡住冲洗。 */
    async _ensureFonts(text) {
        try {
            if (!document.fonts || !document.fonts.load) return;
            const t = (text || '') +
                '今日小记特别事件时光机共段回忆把数字回忆冲洗成纪念周一二三四五六日天年月' +
                'PawlaroidTimeMachine0123456789';
            const fams = [
                '400 40px "Ma Shan Zheng"',
                '400 40px "Long Cang"',
                '400 40px "Caveat"',
                '400 40px "ZCOOL KuaiLe"'
            ];
            await Promise.all(fams.map(f => document.fonts.load(f, t).catch(() => null)));
            await Promise.race([
                document.fonts.ready,
                new Promise(r => setTimeout(r, 2500))
            ]);
        } catch (e) { /* 字体没就绪就回退系统字体，不阻断冲洗 */ }
    },

    /* 确定性伪随机：同样的回忆导出同样的排版，避免每次胶带位置乱跳 */
    _seedRand(seed) {
        let s = (seed >>> 0) || 1;
        return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    },

    _formatDateEn(iso) {
        const d = iso ? new Date(iso) : new Date();
        if (isNaN(d.getTime())) return '';
        const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    },

    _weekCn(iso) {
        const d = iso ? new Date(iso) : new Date();
        if (isNaN(d.getTime())) return '';
        return '周' + '日一二三四五六'[d.getDay()];
    },

    /* 手帐纸：米白纸基 + 纤维颗粒 + 极淡点格 + 页边暖影 */
    _drawJournalPaper(ctx, W, H, rnd) {
        ctx.fillStyle = '#FBF7EE';
        ctx.fillRect(0, 0, W, H);
        // 纸纤维颗粒（让它像纸，不像纯色网页底）
        const grains = Math.round(W * H / 2400);
        for (let i = 0; i < grains; i++) {
            const x = rnd() * W, y = rnd() * H, r = rnd() * 1.5 + 0.3;
            ctx.fillStyle = rnd() > 0.5 ? 'rgba(168,124,64,0.055)' : 'rgba(255,255,255,0.55)';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        // 手帐点格
        ctx.fillStyle = 'rgba(190,152,104,0.085)';
        for (let gy = 44; gy < H; gy += 46) {
            for (let gx = 44; gx < W; gx += 46) {
                ctx.beginPath(); ctx.arc(gx, gy, 1.35, 0, Math.PI * 2); ctx.fill();
            }
        }
        // 页边暖影
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.62);
        vg.addColorStop(0, 'rgba(120,80,40,0)');
        vg.addColorStop(1, 'rgba(120,80,40,0.075)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },

    /* washi 和纸胶带：半透明色块 + 斜纹 + 毛边，手帐的灵魂元素 */
    _drawTape(ctx, cx, cy, w, h, rotDeg, tone) {
        const palette = {
            cream: ['rgba(255,226,182,0.88)', 'rgba(238,190,126,0.42)'],
            pink: ['rgba(255,214,214,0.88)', 'rgba(240,168,168,0.38)'],
            mint: ['rgba(208,232,214,0.88)', 'rgba(148,196,168,0.38)'],
            sky: ['rgba(206,226,244,0.88)', 'rgba(146,182,220,0.38)']
        };
        const p = palette[tone] || palette.cream;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((rotDeg || 0) * Math.PI / 180);
        ctx.shadowColor = 'rgba(120,80,40,0.16)';
        ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
        // 毛边路径（左右两端做锯齿，避免像规整的色块按钮）
        const hw = w / 2, hh = h / 2, teeth = 6, step = h / teeth;
        ctx.beginPath();
        ctx.moveTo(-hw, -hh);
        ctx.lineTo(hw, -hh);
        for (let i = 0; i < teeth; i++) {
            ctx.lineTo(hw + (i % 2 ? -3.5 : 3.5), -hh + step * (i + 1));
        }
        ctx.lineTo(-hw, hh);
        for (let i = teeth; i > 0; i--) {
            ctx.lineTo(-hw + (i % 2 ? -3.5 : 3.5), -hh + step * (i - 1));
        }
        ctx.closePath();
        ctx.fillStyle = p[0];
        ctx.fill();
        ctx.shadowColor = 'transparent';
        // 斜纹
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = p[1];
        ctx.lineWidth = 5;
        for (let x = -w; x < w; x += 17) {
            ctx.beginPath(); ctx.moveTo(x, -hh - 2); ctx.lineTo(x + h * 1.3, hh + 2); ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
    },

    /* 小爪印装饰 */
    _drawPaw(ctx, x, y, s, rotDeg, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((rotDeg || 0) * Math.PI / 180);
        ctx.scale(s || 1, s || 1);
        ctx.fillStyle = color || 'rgba(196,152,104,0.34)';
        ctx.beginPath(); ctx.ellipse(0, 6.2, 7.6, 6.3, 0, 0, Math.PI * 2); ctx.fill();
        const toes = [[-7.5, -3.0, 3.0, 3.7, -0.32], [-2.7, -7.5, 3.0, 3.9, -0.12],
                      [2.7, -7.5, 3.0, 3.9, 0.12], [7.5, -3.0, 3.0, 3.7, 0.32]];
        for (const t of toes) {
            ctx.beginPath(); ctx.ellipse(t[0], t[1], t[2], t[3], t[4], 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    },

    /* 手绘波浪线（替代规整分隔线，去掉网页感） */
    _drawWave(ctx, x1, x2, y, amp, color, lw) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = lw || 3;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let x = x1; x <= x2; x += 2) {
            const yy = y + Math.sin((x - x1) / 13) * amp;
            if (x === x1) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
        ctx.restore();
    },

    /* 手撕便签纸形状（在已 translate 到中心的坐标系里绘制）：
       顶部撕口 + 右下折角 + 淡淡横格，彻底摆脱“输入框”观感 */
    _drawMemoShape(ctx, w, h, lineTop, lineH, lineCount) {
        const hw = w / 2, hh = h / 2, fold = 30;
        ctx.save();
        ctx.shadowColor = 'rgba(120,80,40,0.20)';
        ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
        ctx.beginPath();
        ctx.moveTo(-hw, -hh + 4);
        const steps = 18;
        for (let i = 1; i <= steps; i++) {
            const px = -hw + (w * i / steps);
            const py = -hh + (i % 2 ? 0 : 7) - 1;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(hw, hh - fold);
        ctx.lineTo(hw - fold, hh);
        ctx.lineTo(-hw, hh);
        ctx.closePath();
        ctx.fillStyle = '#FFF9EA';
        ctx.fill();
        ctx.restore();
        // 折角
        ctx.beginPath();
        ctx.moveTo(hw, hh - fold);
        ctx.lineTo(hw - fold, hh);
        ctx.lineTo(hw - fold, hh - fold);
        ctx.closePath();
        ctx.fillStyle = 'rgba(230,203,157,0.85)';
        ctx.fill();
        // 便签横格
        if (lineCount > 0) {
            ctx.strokeStyle = 'rgba(214,180,130,0.34)';
            ctx.lineWidth = 1.4;
            for (let i = 0; i < lineCount; i++) {
                const ly = -hh + lineTop + lineH * (i + 1) - 8;
                if (ly > hh - 24) break;
                ctx.beginPath();
                ctx.moveTo(-hw + 34, ly);
                ctx.lineTo(hw - 34, ly);
                ctx.stroke();
            }
        }
    },

    /* 特别事件 → emoji 标签胶囊（✨ 开心瞬间） */
    _tagEmoji(tag) {
        const map = {
            '第一次尝试': '🌱', '开心瞬间': '✨', '搞怪行为': '🤪',
            '出门玩耍': '🌳', '特别纪念日': '🎂'
        };
        if (map[tag]) return map[tag];
        const t = String(tag || '');
        if (/生日|周岁|纪念/.test(t)) return '🎂';
        if (/疫苗|医院|体检|生病|驱虫|吃药/.test(t)) return '💊';
        if (/洗澡|冲凉|沐浴|泡澡/.test(t)) return '🛁';
        if (/剪毛|理毛|美容|修毛|剃毛/.test(t)) return '✂️';
        if (/出门|旅行|散步|公园|玩|外面/.test(t)) return '🌳';
        if (/吃|零食|饭|罐头|下午茶/.test(t)) return '🍖';
        if (/睡|懒|梦|打盹/.test(t)) return '😴';
        if (/第一次|初次|首/.test(t)) return '🌱';
        if (/搞怪|捣蛋|疯/.test(t)) return '🤪';
        if (/开心|快乐|高兴|幸福|甜蜜/.test(t)) return '✨';
        if (/拍照|合影|写真/.test(t)) return '📷';
        return '✨';
    },

    /* ============================================================
       宠物回忆手帐页（1080 宽竖版，小红书友好）
       ------------------------------------------------------------
       层级：顶部 宠物名 / Time Machine / 日期
             中部 拍立得主体（微倾斜 + 胶带贴角）
             底部 今日小记（手撕便签）/ 特别事件（emoji 胶囊）/ 品牌
       拍立得内部只保留相纸内容，故事文字一律画在相纸外部，不重复。
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

        /* 预热手写字体：必须带上真实文案，否则 unicode-range 分片不会下载 */
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

        /* ---------- 阶段一：测量 ---------- */
        const HEAD_H = 356;
        const PHOTO_W = 604, TILT_PAD = 34;
        const GAP_DATE = 22, GAP_PHOTO = 32, GAP_CAP = 26, GAP_NOTE = 24, GAP_TAG = 18, GAP_ENTRY = 84;
        const TAG_H = 58, TAG_GAP = 16, TAG_ROW_GAP = 14;
        const MEMO_PAD = 44, MEMO_INDENT = 38;
        const showEntryDate = list.length > 1;   // 单条时顶部已有完整日期，避免重复

        const blocks = [];
        let y = HEAD_H;

        for (const rec of list) {
            const blk = { rec };

            // 日期（手写 + 小胶带）
            blk.dateCn = this._formatDate(rec.date, 'cn');
            blk.week = this._weekCn(rec.date);
            blk.showDate = showEntryDate;
            blk.dateH = showEntryDate ? 64 : 0;
            if (showEntryDate) y += blk.dateH + GAP_DATE;

            // 拍立得主体：必须按真实比例测高，否则照片会溢出（旧模板的方形假设导致溢出）
            let img = null;
            try { img = await this._loadImage(rec.image); } catch (e) { img = null; }
            blk.img = img;
            blk.photoW = PHOTO_W;
            blk.photoH = Math.round(PHOTO_W * (img ? (img.height / img.width) : 1.134));
            blk.tilt = (rnd() * 2.6 - 1.3);
            y += blk.photoH + TILT_PAD + GAP_PHOTO;

            // 日常陪伴文字（画在相纸外部）
            const cap = this._resolveTitle(rec);
            measure.font = hand(42);
            blk.capLines = this._wrapText(measure, cap, CW - 90);
            blk.capH = blk.capLines.length * 42 * 1.5;
            y += blk.capH + GAP_CAP;

            // 今日小记 → 手撕便签
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

            // 特别事件 → emoji 胶囊
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
        const totalH = Math.max(contentH, 1440);   // 竖版分享比例（1080×1440 起）

        /* ---------- 阶段二：绘制 ---------- */
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = totalH;
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'alphabetic';

        this._drawJournalPaper(ctx, W, totalH, rnd);

        // 页面边缘散落的小爪印（先画，内容会自然压在上面）
        for (let i = 0; i < 7; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const px = W / 2 + side * (W / 2 - 36) + (rnd() * 18 - 9);
            const py = 420 + rnd() * Math.max(120, totalH - 580);
            this._drawPaw(ctx, px, py, 0.85 + rnd() * 0.5, rnd() * 360, 'rgba(200,158,110,0.20)');
        }

        // 顶部两角贴纸胶带
        this._drawTape(ctx, 92, 34, 210, 56, -26, 'cream');
        this._drawTape(ctx, W - 92, 34, 210, 56, 26, 'pink');

        /* —— 顶部：宠物名 / Time Machine / 日期 —— */
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

        /* —— 逐条回忆 —— */
        let cy = HEAD_H;
        for (let bi = 0; bi < blocks.length; bi++) {
            const blk = blocks[bi];

            // 日期（手写贴在胶带上）
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

            // 拍立得主体：微倾斜 + 阴影 + 胶带贴角
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
                // 贴角胶带（换算到旋转后的两个上角）
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

            // 日常陪伴文字（手写，相纸之外）
            ctx.textAlign = 'center';
            ctx.fillStyle = '#6D4A33';
            ctx.font = hand(42);
            let my = cy + 40;
            for (const ln of blk.capLines) { ctx.fillText(ln, W / 2, my); my += 42 * 1.5; }
            cy += blk.capH + GAP_CAP;

            // 今日小记：手撕便签
            if (blk.memoItems) {
                const mx = (W - blk.memoW) / 2;
                ctx.save();
                ctx.translate(mx + blk.memoW / 2, cy + blk.memoH / 2);
                ctx.rotate(blk.memoTilt * Math.PI / 180);
                this._drawMemoShape(ctx, blk.memoW, blk.memoH, 96, blk.memoLineH, blk.memoLineCount);
                const L = -blk.memoW / 2, T = -blk.memoH / 2;
                // 标签（不是表单 label，是手帐小标题）
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillStyle = '#C08A4A';
                ctx.font = cute(26);
                ctx.fillText('今日小记', L + MEMO_PAD + 34, T + 36);
                this._drawPaw(ctx, L + MEMO_PAD + 14, T + 50, 0.85, -14, 'rgba(200,150,90,0.65)');
                // 正文
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
                // 便签顶部压一条小胶带
                this._drawTape(ctx, mx + 96, cy + 4, 128, 40, -4 + blk.memoTilt, 'cream');
                cy += blk.memoH + GAP_NOTE;
            }

            // 特别事件：emoji 胶囊
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

            // 回忆之间的手绘分隔（最后一条不画）
            if (bi < blocks.length - 1) {
                const dy = cy + GAP_ENTRY / 2;
                this._drawWave(ctx, W / 2 - 130, W / 2 - 30, dy, 2.4, 'rgba(214,180,130,0.75)', 2.5);
                this._drawWave(ctx, W / 2 + 30, W / 2 + 130, dy, 2.4, 'rgba(214,180,130,0.75)', 2.5);
                this._drawPaw(ctx, W / 2, dy - 2, 1.0, 0, 'rgba(214,175,120,0.8)');
            }
            cy += GAP_ENTRY;
        }

        /* —— 底部：品牌信息 —— */
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
    },

    _warn(msg) {
        if (window.App && App.toast) App.toast(msg);
        else alert(msg);
    }
};
