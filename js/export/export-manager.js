/* ============================================================
   export-manager.js — 导出共享层 + 导出菜单
   ------------------------------------------------------------
   拆分自原 js/exporter.js（1032 行单体）：
   - DevelopAnimation：冲洗仪式（快门 / 聚合 / 显影），原样保留。
   - ExportShared：diary-export.js（Exporter）与 wall-export.js
     （WallExport）共用的工具方法与手帐绘制方法。两个导出模块
     通过 Object.assign({}, ExportShared, {...}) 复用，方法内
     一律用 this 调用，故共享方法在各实例上皆可用。
   - ExportManager：统一导出入口菜单（忠实裸墙 PNG / 纪念长图）。

   依赖：js/assetManager.js（AssetManager）、js/wall.js（Wall）、
   js/share-save.js（MobileSave）。本文件须最先加载。
   全局：ExportShared / DevelopAnimation / ExportManager。
   ============================================================ */

/* ============================================================
   冲洗仪式组件（DevelopAnimation）— 原样保留
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
   导出共享层（ExportShared）
   ------------------------------------------------------------
   所有导出模块共用的工具与手帐绘制方法。两个导出模块通过
   Object.assign 继承本对象，方法内一律 this 调用。
   ============================================================ */
const ExportShared = {
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
        // 历史兜底：assets-export.js 注入的 PAW_STICKER_DATAURI
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

    _resolveTitle(rec) {
        const t = (rec && rec.title && rec.title.trim()) ||
                  (rec && rec.text && rec.text.trim()) || '';
        return t || (rec && rec.petName ? `和 ${rec.petName} 的这一天` : '日常陪伴');
    },

    /* 字体栈（手帐风 / 中文 / 手写 / 英文 / 可爱） */
    _kanjiFont: '"STKaiti","Kaiti","KaiTi","STSong","SimSun","Songti SC","Noto Serif CJK SC",serif',
    _sansCNFont: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
    _handFont: '"Ma Shan Zheng","Long Cang","STKaiti","Kaiti","KaiTi",cursive,serif',
    _memoFont: '"Long Cang","Ma Shan Zheng","STKaiti","Kaiti","KaiTi",cursive,serif',
    _enFont: '"Caveat","Snell Roundhand","Segoe Script","Ma Shan Zheng",cursive',
    _cuteFont: '"ZCOOL KuaiLe","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',

    /* canvas 字体预热（见原 exporter 注释）：必须先用真实文案 document.fonts.load
       预热，否则导出会静默回退到系统字体，手写手帐风瞬间变回扁平网页感。 */
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
        const grains = Math.round(W * H / 2400);
        for (let i = 0; i < grains; i++) {
            const x = rnd() * W, y = rnd() * H, r = rnd() * 1.5 + 0.3;
            ctx.fillStyle = rnd() > 0.5 ? 'rgba(168,124,64,0.055)' : 'rgba(255,255,255,0.55)';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(190,152,104,0.085)';
        for (let gy = 44; gy < H; gy += 46) {
            for (let gx = 44; gx < W; gx += 46) {
                ctx.beginPath(); ctx.arc(gx, gy, 1.35, 0, Math.PI * 2); ctx.fill();
            }
        }
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
        ctx.beginPath();
        ctx.moveTo(hw, hh - fold);
        ctx.lineTo(hw - fold, hh);
        ctx.lineTo(hw - fold, hh - fold);
        ctx.closePath();
        ctx.fillStyle = 'rgba(230,203,157,0.85)';
        ctx.fill();
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

    /* 背景：cover 铺满（导出共享） */
    _drawCover(ctx, img, W, H) {
        const ir = img.width / img.height, tr = W / H;
        let dw, dh, dx, dy;
        if (ir > tr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
        else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
        ctx.drawImage(img, dx, dy, dw, dh);
    },

    /* 程序化毛毡兜底背景（导出共享） */
    _drawFelt(ctx, W, H) {
        ctx.fillStyle = '#f3e3c8'; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(141,92,47,0.10)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },

    _warn(msg) {
        if (window.App && App.toast) App.toast(msg);
        else alert(msg);
    }
};

/* ============================================================
   导出菜单（ExportManager）
   ------------------------------------------------------------
   统一入口：忠实裸墙 PNG（默认贴内容裁切 / 完整视角）与
   纪念长图（4:5 模板，原封保留）。按钮 onclick 指向本菜单。
   ============================================================ */
const ExportManager = {
    _mask: null,

    openMenu() {
        if (typeof Wall === 'undefined') {
            this._legacyExport();
            return;
        }
        this.closeMenu();
        const mask = document.createElement('div');
        mask.className = 'export-mask';
        mask.innerHTML =
            '<div class="export-card">' +
            '  <div class="export-title">把回忆冲洗出来 🐾</div>' +
            '  <button class="export-opt" data-act="wall">' +
            '    <span class="export-opt-ico">🖼</span>' +
            '    <span class="export-opt-body"><b>导出展示墙</b></span>' +
            '  </button>' +
            '  <button class="export-opt" data-act="wall-full">' +
            '    <span class="export-opt-ico">🗾</span>' +
            '    <span class="export-opt-body"><b>导出完整墙</b></span>' +
            '  </button>' +
            '  <button class="export-opt" data-act="diary">' +
            '    <span class="export-opt-ico">📖</span>' +
            '    <span class="export-opt-body"><b>生成回忆长图</b></span>' +
            '  </button>' +
            '  <button class="export-cancel" data-act="cancel">取消</button>' +
            '</div>';
        document.body.appendChild(mask);
        this._mask = mask;
        requestAnimationFrame(() => mask.classList.add('on'));

        mask.addEventListener('click', (e) => {
            const btn = e.target.closest('.export-opt, .export-cancel');
            if (!btn) return;
            const act = btn.dataset.act;
            this.closeMenu();
            if (act === 'wall') this._exportWall({ range: 'content' });
            else if (act === 'wall-full') this._exportWall({ range: 'viewport' });
            else if (act === 'diary') this._exportDiary();
        });
    },

    closeMenu() {
        if (this._mask && this._mask.parentNode) this._mask.parentNode.removeChild(this._mask);
        this._mask = null;
    },

    _exportWall(opts) {
        if (typeof WallExport !== 'undefined') WallExport.export(opts);
        else if (typeof Exporter !== 'undefined') Exporter.exportWall();
        else this._warn('导出模块未就绪');
    },

    _exportDiary() {
        if (typeof Exporter !== 'undefined') Exporter.exportWall();
        else this._warn('导出模块未就绪');
    },

    /* 无 Wall 时的兜底（理论上不会触发） */
    _legacyExport() {
        if (typeof Exporter !== 'undefined') Exporter.exportWall();
        else alert('导出功能未就绪');
    },

    _warn(msg) {
        if (window.App && App.toast) App.toast(msg);
        else alert(msg);
    }
};
