/* ============================================================
   wall.js — 拍立得展示墙（独立模块，不修改既有生成流程）
   ------------------------------------------------------------
   分层结构（DOM 独立元素，不合成单张图）：
     Layer 1  background.webp       毛毡背景（CSS）
     Layer 2  拍立得照片            .wall-item.type-polaroid
     Layer 3  小纸条                .wall-item.type-note
     Layer 4  贴纸                  .wall-item.type-sticker
     Layer 5  图钉 / 装饰           .wall-item.type-pin
     Layer 6  浮动工具（index.html 内）

   数据持久化：localStorage['pawlaroid_wall']
   每个元素保存 { id, type, src?, text?, color?, x, y, rotation, scale }
     x/y 用百分比（相对展示区），响应式；rotation(-5~5deg 随机)；scale 缩放系数

   物件系统（统一交互，不重复造轮子）：
     PolaroidCard → StickyNote → Sticker → Pin
   所有物件共用同一套：拖动(_startDrag/_startDragNote) / 缩放(_startScale)
   / 旋转(_startRotate) / 删除(_remove) / 选中(_select)。
   小纸条只是在此基础上多了一个“点按进入编辑文字”的能力。

   资源：贴纸读 window.PAW_STICKERS，图钉读 window.PAW_PINS（file:// 友好）。
   ============================================================ */
const Wall = {
    STORAGE_KEY: 'pawlaroid_wall',
    stage: null,
    stickerPanel: null,
    toolPanel: null,
    data: [],
    selectedId: null,
    gesture: null,

    /* 首次固定引导状态（不写入存储模型，仅本会话） */
    tipActive: false,
    pinTipEl: null,
    tipTimer: null,

    /* 展示墙主题：当前选中的主题与花色变体（持久化在 localStorage） */
    themeId: 'felt',
    themeVariant: 'cream',
    themes: null,            // 主题配置数组（window.PAW_WALL_THEMES / 远程 JSON）
    THEME_KEY: 'pawlaroid_wall_theme',

    /* 各类元素基础显示尺寸（px），scale 在此基础上倍增 */
    BASE: { polaroid: 196, sticker: 90, pin: 56, note: 184 },

    /* 小纸条三种颜色（V1）：温柔日记感 / 便利贴温暖 / 可爱宠物感 */
    NOTE_COLORS: {
        cream:  { name: '奶油白', cls: 'note-cream' },
        yellow: { name: '浅黄色', cls: 'note-yellow' },
        pink:   { name: '浅粉色', cls: 'note-pink' }
    },

    /* ---------- 初始化（由 App.goWall 调用） ---------- */
    init() {
        this.stage = document.getElementById('wallStage');
        this.stickerPanel = document.getElementById('wallStickerPanel');
        // 展示墙背景由 CSS (.wall-bg) 加载仓库内 assets/backgrounds/wall-bg.webp（同源，无需 JS 注入）
        this.toolPanel = document.getElementById('wallToolPanel');
        if (!this.stage) return;

        // 事件只绑定一次，避免反复进入展示墙时重复监听
        if (!this._inited) {
            this._bindToolbar();
            this._bindStage();
            this._inited = true;
        }
        // 预加载贴纸配置（http 下 fetch stickers.json；file:// 下回退注入数组）
        this._loadStickerConfig();
        // 主题配置 + 背景应用（http 下 fetch 远程 JSON；file:// 下回退 window.PAW_WALL_THEMES）
        this._loadThemeConfig().then(() => {
            this._applyTheme(this.themeId, this.themeVariant, false);
        });
        this._render();
        // 首次进入展示墙：若有未固定照片，给出“用图钉固定回忆”的轻引导
        this._maybeShowPinTip();
    },

    /* 工具栏按钮绑定（🐾 贴纸 / 🧰 工具箱 / 浮动按钮 / 关闭面板） */
    _bindToolbar() {
        const stickerBtn = document.getElementById('wallBtnStickers');
        const toolBtn = document.getElementById('wallBtnTools');
        const fab = document.getElementById('wallFab');
        const menu = document.getElementById('wallFabMenu');
        if (stickerBtn) stickerBtn.addEventListener('click', () => this._togglePanel('sticker'));
        if (toolBtn) toolBtn.addEventListener('click', () => this._togglePanel('tool'));
        // 主题按钮：展开/收起「回忆墙主题」面板
        const themeBtn = document.getElementById('wallBtnTheme');
        if (themeBtn) themeBtn.addEventListener('click', () => this._togglePanel('theme'));
        // 🐾 浮动按钮：若面板已展开，再次点击即收起；否则展开工具菜单
        if (fab) {
            fab.addEventListener('click', () => {
                const anyOpen = this.stickerPanel.classList.contains('open') ||
                                this.toolPanel.classList.contains('open');
                if (anyOpen) {
                    this._togglePanel(null);
                } else if (menu) {
                    menu.classList.toggle('open');
                }
            });
        }
    },

    _bindStage() {
        // 点击空白处取消选中
        this.stage.addEventListener('pointerdown', (e) => {
            if (e.target === this.stage || e.target.classList.contains('wall-bg')) {
                this._select(null);
            }
        });
    },

    /* ---------- 数据读写 ---------- */
    _load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            this.data = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(this.data)) this.data = [];
        } catch (e) {
            this.data = [];
        }
        this._normalize();
    },
    /* 固定态字段兼容：旧数据只有 pinned/pinnedTo，没有 attachmentType。
       新数据用 attachmentType 区分固定方式（pin/magnet/tape…），为未来不同墙面主题（毛毡/软木/冰箱磁贴）预留扩展点。 */
    _normalize() {
        this.data.forEach(it => {
            if (it.type === 'polaroid') {
                if (it.pinned == null) it.pinned = false;
                if (it.pinned && !it.attachmentType) it.attachmentType = 'pin';
            } else if (it.type === 'pin') {
                if (it.pinnedTo && !it.attachmentType) it.attachmentType = 'pin';
                // 相对锚点：图钉位置按住片 width/height 比例计算，缩放/大小不同都正确贴合（兼容旧数据）
                if (!it.pinAnchor || typeof it.pinAnchor.x !== 'number' || typeof it.pinAnchor.y !== 'number') {
                    it.pinAnchor = { x: 0.5, y: 0 };   // 默认：照片顶部中心
                }
            }
        });
    },
    _save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('[Wall] 保存失败（可能超出 localStorage 容量）', e);
        }
    },

    /* ---------- 公共：添加拍立得（结果页 / 时光机入口调用） ----------
       关联 memoryId：同一回忆只上墙一次（幂等），避免“结果页上墙 + 时光机再上墙”
       产生重复照片。展示墙读取的是记忆的引用，而非各自独立保存一份图片。 */
    addPolaroid(memoryId, dataURL) {
        if (!dataURL && !memoryId) return null;
        this._load();
        const existing = this.data.find(d => d.type === 'polaroid' && memoryId && d.memoryId === memoryId);
        if (existing) {
            if (this.stage) { this._render(); this._select(existing.id); }
            return existing.id;
        }
        // 若记忆里已有该图，墙只保存 memoryId 引用（不重复存一份大图），
        // 渲染时再按 memoryId 从 PawMemory 取图——避免 localStorage 配额被快速占满。
        const memHasImg = (typeof PawMemory !== 'undefined' && memoryId && (PawMemory.get(memoryId) || {}).image);
        const item = {
            id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
            type: 'polaroid',
            memoryId: memoryId || '',
            src: memHasImg ? '' : (dataURL || ''),
            x: 50, y: 50,
            rotation: this._rand(-5, 5),
            scale: 1
        };
        this.data.push(item);
        this._save();
        if (this.stage) {
            this._render();
            this._select(item.id);
        }
        return item.id;
    },

    /* 解析拍立得图片地址：优先用自带的 src（旧数据/无记忆时），
       否则按 memoryId 从 PawMemory 取图。 */
    _resolvePolaroidSrc(it) {
        if (it.src) return it.src;
        if (it.memoryId && typeof PawMemory !== 'undefined') {
            const m = PawMemory.get(it.memoryId);
            if (m && m.image) return m.image;
        }
        return '';
    },

    /* ---------- 贴纸 / 工具箱（图钉 + 小纸条） ----------
       toggle 行为：点击已展开的入口会收起；两者互斥（展开一个自动收起另一个）。
       which === null 时全部收起（用于 🐾 再次点击 / 添加纸条后）。 */
    _togglePanel(which) {
        if (!this.stickerPanel || !this.toolPanel) return;
        const stickerOpen = this.stickerPanel.classList.contains('open');
        const toolOpen = this.toolPanel.classList.contains('open');
        const themePanel = document.getElementById('wallThemePanel');
        const themeOpen = themePanel ? themePanel.classList.contains('open') : false;
        let showSticker = stickerOpen;
        let showTool = toolOpen;
        let showTheme = themeOpen;
        if (which === 'sticker') { showSticker = !stickerOpen; showTool = false; showTheme = false; }
        else if (which === 'tool') { showTool = !toolOpen; showSticker = false; showTheme = false; }
        else if (which === 'theme') { showTheme = !themeOpen; showSticker = false; showTool = false; }
        else { showSticker = false; showTool = false; showTheme = false; }
        this.stickerPanel.classList.toggle('open', showSticker);
        this.toolPanel.classList.toggle('open', showTool);
        if (themePanel) themePanel.classList.toggle('open', showTheme);
        // 展开选择面板时收起浮动工具菜单，避免遮挡
        const menu = document.getElementById('wallFabMenu');
        if (menu) menu.classList.remove('open');
        if (showSticker) this._fillStickers();
        if (showTool) this._fillTool();
        if (showTheme) this._fillTheme();
    },

    /* 工具箱面板：固定装饰（图钉/纽扣/磁铁，由主题决定）+ 小纸条，二者分类展示 */
    _fillTool() {
        if (!this.toolPanel) return;
        const theme = this._getTheme();
        const att = theme ? theme.attachment : 'pin';
        // 固定装饰：根据当前主题的装饰集渲染（图钉 / 纽扣 / 磁铁）
        const pinBox = this.toolPanel.querySelector('.wall-pin-list');
        if (pinBox) {
            pinBox.innerHTML = '';
            const decor = this._getDecorSet();
            decor.forEach(p => {
                const el = document.createElement('button');
                el.className = 'wall-panel-item';
                el.innerHTML = `<img src="${p.file}" alt="${p.name}"><span>${p.name}</span>`;
                el.addEventListener('click', () => this._addDecor('pin', p));
                pinBox.appendChild(el);
            });
            // 动态标题 / 提示文案（图钉 vs 纽扣 vs 磁铁）
            const titleEl = this.toolPanel.querySelector('.wall-pin-title');
            const hintEl = this.toolPanel.querySelector('.wall-pin-hint');
            if (titleEl) titleEl.textContent = (att === 'magnet') ? '🧲 磁铁固定' : (att === 'button' ? '🧷 纽扣固定' : '📌 固定回忆');
            if (hintEl) {
                const noun = (att === 'magnet') ? '磁铁' : (att === 'button' ? '纽扣' : '图钉');
                const ico = (att === 'magnet') ? '🧲' : '📌';
                hintEl.innerHTML = `选一枚${noun}，<strong>拖到照片上</strong>把它固定在墙上${ico}（固定后将不能自由拖动）`;
            }
        }
        // 小纸条：三色色卡，点击即新增对应颜色纸条
        const noteBox = this.toolPanel.querySelector('.wall-note-list');
        if (noteBox) {
            noteBox.innerHTML = '';
            Object.entries(this.NOTE_COLORS).forEach(([key, c]) => {
                const el = document.createElement('button');
                el.className = 'wall-panel-item wall-note-swatch ' + c.cls;
                el.innerHTML = `<span>${c.name}</span>`;
                el.addEventListener('click', () => this.addNote(key));
                noteBox.appendChild(el);
            });
        }
    },

    /* ---------- 主题系统 ---------- */

    /* 读取主题配置：统一经 AssetManager 双源加载（http: assets/config/themes.json；file://: window.PAW_WALL_THEMES） */
    async _loadThemeConfig() {
        let arr = await AssetManager.load('themes');
        this.themes = arr;
        // 恢复上次选择的主题（持久化）
        try {
            const saved = JSON.parse(localStorage.getItem(this.THEME_KEY) || 'null');
            if (saved && saved.theme && this._getTheme(saved.theme)) {
                this.themeId = saved.theme;
                this.themeVariant = (saved.variant && this._getVariant(this.themeId, saved.variant)) ? saved.variant : this._getTheme(this.themeId).defaultVariant;
            }
        } catch (e) {}
        if (!this._getTheme(this.themeId)) this.themeId = arr.length ? arr[0].id : 'felt';
        if (!this._getVariant(this.themeId, this.themeVariant)) {
            const t = this._getTheme(this.themeId);
            this.themeVariant = t ? t.defaultVariant : 'cream';
        }
        return arr;
    },

    _getTheme(id) {
        id = id || this.themeId;
        return (this.themes || []).find(t => t.id === id) || null;
    },
    _getVariant(themeId, vid) {
        const t = this._getTheme(themeId);
        if (!t) return null;
        return (t.variants || []).find(v => v.id === (vid || this.themeVariant)) || null;
    },
    /* 当前主题的装饰集：统一从 AssetManager 按 wallTheme 过滤
       （pins.json 中每项声明自己适配哪些主题，新增固定件无需改此逻辑） */
    _getDecorSet() {
        const t = this._getTheme();
        const tid = t ? t.id : 'felt';
        return AssetManager.getDecor(tid);
    },

    /* 渲染主题选择面板：三张主题卡 + 当前主题的花色变体 */
    _fillTheme() {
        const list = document.getElementById('wallThemeList');
        const varBox = document.getElementById('wallThemeVariants');
        if (!list || !this.themes) return;
        list.innerHTML = '';
        this.themes.forEach(t => {
            const el = document.createElement('button');
            el.className = 'wall-theme-card' + (t.id === this.themeId ? ' active' : '');
            el.innerHTML = `<span class="wall-theme-ico">${t.icon}</span><span class="wall-theme-name">${t.name}</span>`;
            el.addEventListener('click', () => {
                this._applyTheme(t.id, this._getTheme(t.id).defaultVariant, true);
                this._fillTheme();
            });
            list.appendChild(el);
        });
        if (varBox) {
            varBox.innerHTML = '';
            const t = this._getTheme();
            const vTitle = document.createElement('div');
            vTitle.className = 'wall-panel-section-title';
            vTitle.textContent = '花色';
            varBox.appendChild(vTitle);
            const row = document.createElement('div');
            row.className = 'wall-theme-variant-row';
            (t.variants || []).forEach(v => {
                const b = document.createElement('button');
                b.className = 'wall-theme-variant' + (v.id === this.themeVariant ? ' active' : '');
                b.title = v.name;
                b.style.background = v.overlay ? v.overlay.split(',')[0].replace('linear-gradient(180deg, ', '').replace(')', '') : '#eee';
                b.innerHTML = `<span>${v.name}</span>`;
                b.addEventListener('click', () => {
                    this._applyTheme(this.themeId, v.id, true);
                    this._fillTheme();
                });
                row.appendChild(b);
            });
            varBox.appendChild(row);
        }
    },

    /* 应用主题：切换背景图（CSS 变量）+ 固定方式 + 装饰集 + 持久化 + 刷新工具栏 */
    _applyTheme(themeId, variantId, persist) {
        const t = this._getTheme(themeId);
        if (!t) return;
        const v = this._getVariant(themeId, variantId) || t.variants[0];
        this.themeId = themeId;
        this.themeVariant = v.id;

        const ac = window.ASSET_CONFIG;
        const bgUrl = ac && ac.resolve ? ac.resolve(v.file) : ('assets/' + v.file);
        const bgEl = this.stage ? this.stage.querySelector('.wall-bg') : null;
        if (bgEl) {
            // 背景图层 = 主题花色叠层（柔和 tint）+ 背景图，营造空间感
            bgEl.style.backgroundImage = (v.overlay ? v.overlay + ', ' : '') + `url("${bgUrl}")`;
            bgEl.style.backgroundSize = 'cover, cover';
            bgEl.style.backgroundPosition = 'center, center';
            bgEl.style.backgroundRepeat = 'no-repeat, no-repeat';
        }
        // 阶段 data-theme，供主题特异样式（如冰箱更干净的阴影）
        if (this.stage) this.stage.dataset.theme = themeId;

        // 导出按主题取背景：同步覆盖 window.PAW_WALL_BG（exporter 默认读取它）
        this.themeBg = bgUrl;
        window.PAW_WALL_BG = bgUrl;

        // 主题按钮文案 + 工具栏（装饰集随主题切换）
        const label = document.getElementById('wallThemeLabel');
        if (label) label.textContent = t.name;
        if (this.toolPanel && this.toolPanel.classList.contains('open')) this._fillTool();

        // 若当前有固定装饰，重渲染使其 attachmentType 与主题一致（仅视觉；数据已按各自类型保存）
        if (persist) {
            try { localStorage.setItem(this.THEME_KEY, JSON.stringify({ theme: themeId, variant: v.id })); } catch (e) {}
            this._toast(`已切换到「${t.name}」· ${v.name}`);
        }
    },

    /* 新增一张小纸条（默认出现在中央 + 随机轻微旋转），随后自动进入编辑态 */
    addNote(color) {
        this._load();
        const item = {
            id: 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
            type: 'note',
            text: '',
            color: this.NOTE_COLORS[color] ? color : 'cream',
            x: 50, y: 50,
            rotation: this._rand(-5, 5),
            scale: 1,
            baseSize: this.BASE.note,
            noteW: 1,   // 宽度系数（相对 baseSize，自由拖拽调整）
            noteH: 1    // 高度系数
        };
        this.data.push(item);
        this._save();
        this._render();
        this._select(item.id);
        this._togglePanel(null);
        // 自动进入编辑，方便立刻写下文字
        const el = this.stage.querySelector(`.wall-item[data-id="${item.id}"]`);
        if (el) this._editNote(item, el);
    },

    /* 贴纸配置加载：统一经 AssetManager 双源加载（http: assets/config/stickers.json；file://: window.PAW_STICKERS） */
    async _loadStickerConfig() {
        let arr = await AssetManager.load('stickers');
        this._stickers = arr;
        return arr;
    },

    _fillStickers() {
        const box = this.stickerPanel ? this.stickerPanel.querySelector('.wall-panel-list') : null;
        if (!box) return;
        const render = (list) => {
            box.innerHTML = '';
            (list || []).forEach(s => {
                const el = document.createElement('button');
                el.className = 'wall-panel-item';
                const _ac = window.ASSET_CONFIG;
                const _raw = s.image || s.file;
                const _url = (_ac && _ac.resolve) ? _ac.resolve(_raw) : _raw;
                el.innerHTML = `<img src="${_url}" alt="${s.name}"><span>${s.name}</span>`;
                el.addEventListener('click', () => this._addDecor('sticker', s));
                box.appendChild(el);
            });
        };
        // 已加载则直接渲染；否则异步加载配置后渲染（确保 http 下读到最新 JSON）
        if (this._stickers) { render(this._stickers); return; }
        this._loadStickerConfig().then(() => render(this._stickers || window.PAW_STICKERS));
    },

    _addDecor(type, cfg) {
        // 图钉不是普通装饰，而是“把照片固定在墙上”的工具 → 自动吸附到照片顶部并关联
        if (type === 'pin') { this._addPin(cfg); return; }
        this._load();
        // 贴纸图片走 assetConfig.resolve 拼前缀（assets/），同源加载导出不污染画布
        let src = cfg.dataUri || (cfg.image || cfg.file);
        if (!cfg.dataUri && window.ASSET_CONFIG && window.ASSET_CONFIG.resolve) {
            src = window.ASSET_CONFIG.resolve(cfg.image || cfg.file);
        }
        const item = {
            id: type[0] + '_' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
            type,
            decorId: cfg.id || '',     // 记录贴纸/图钉 id，供 Exporter 反查内联资源
            src: src,
            x: 50, y: 50,
            rotation: (cfg.defaultRotation != null) ? cfg.defaultRotation : this._rand(-8, 8),
            scale: (cfg.defaultScale != null) ? cfg.defaultScale : 1,
            baseSize: cfg.defaultSize || this.BASE[type]
        };
        this.data.push(item);
        this._save();
        this._render();
        this._select(item.id);
        this._togglePanel(null);
    },

    /* 新增图钉：作为“固定工具”默认是自由元素（可随意拖动、旋转、缩放）。
       只有用户把它拖到拍立得有效区域（距离 < 阈值）时才吸附到照片顶部并绑定固定，
       此时照片才进入 pinned 状态。不在添加时自动吸附——避免“图钉不在照片旁却锁死照片”。 */
    _addPin(cfg) {
        this._load();
        const hasPhoto = this.data.some(d => d.type === 'polaroid');
        this._addFreePin(cfg, this._resolveDecorSrc(cfg));
        if (!hasPhoto) this._toast('先在墙上放一张照片，再把图钉拖到它上面固定～');
    },

    /* 自由添加一枚图钉（未绑定状态）：保持原“自由装饰”能力，不吸附 */
    _addFreePin(cfg, src) {
        const item = {
            id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
            type: 'pin',
            decorId: cfg.id || '',
            src: src,
            x: 50, y: 50,
            rotation: (cfg.defaultRotation != null) ? cfg.defaultRotation : this._rand(-8, 8),
            scale: (cfg.defaultScale != null) ? cfg.defaultScale : 1,
            baseSize: cfg.defaultSize || this.BASE.pin,
            pinnedTo: '',              // 未绑定（空字符串 = 自由元素，不固定任何照片）
            pinAnchor: cfg.anchor || { x: 0.5, y: 0 },   // 相对锚点：图钉位置按照片 width/height 比例计算
            attachmentType: cfg.attachmentType || 'pin'   // 固定方式（pin/magnet/tape…），数据驱动、不写死
        };
        this.data.push(item);
        this._save();
        this._render();
        this._select(item.id);
        this._togglePanel(null);
    },

    /* 解析装饰资源地址：贴纸是 assets/ 相对路径需 resolve；图钉是内联 SVG data URI，直接用 */
    _resolveDecorSrc(cfg) {
        if (cfg.dataUri) return cfg.dataUri;
        if (cfg.file && String(cfg.file).indexOf('data:') === 0) return cfg.file;
        if (cfg.image && window.ASSET_CONFIG && window.ASSET_CONFIG.resolve) {
            return window.ASSET_CONFIG.resolve(cfg.image);
        }
        return cfg.file || cfg.image || '';
    },

    /* 图钉吸附/绑定检测（在拖拽 move 中每帧调用）：
       - 图钉中心进入某张照片的“有效区域”（距离 < 阈值）且该片未被其他图钉固定
         → 自动吸附到照片顶部、建立绑定（photo.pinned=true），照片进入固定态。
       - 图钉被拖离照片（超出阈值）→ 解除绑定（photo.pinned=false），照片恢复可移动。
       只有绑定成功后照片才被锁死；添加图钉本身不会锁定任何东西。 */
    _updatePinBinding(it, el) {
        if (it.type !== 'pin') return;
        const pinRect = el.getBoundingClientRect();
        const px = pinRect.left + pinRect.width / 2;
        const py = pinRect.top + pinRect.height / 2;
        const margin = Math.max(30, pinRect.width * 0.6);   // 吸附容差（像素）
        let cand = null, candDist = Infinity;
        this.data.forEach(d => {
            if (d.type !== 'polaroid') return;
            const phEl = this.stage.querySelector(`.wall-item[data-id="${d.id}"]`);
            if (!phEl) return;
            const r = phEl.getBoundingClientRect();
            const dx = Math.max(r.left - px, 0, px - r.right);
            const dy = Math.max(r.top - py, 0, py - r.bottom);
            const dist = Math.hypot(dx, dy);
            // 已被“别的图钉”固定的照片不参与绑定，避免一张照片叠多枚
            if (d.pinned && d.pinnedTo && d.pinnedTo !== it.id) return;
            if (dist <= margin && dist < candDist) { cand = d; candDist = dist; }
        });
        const inZone = !!cand;
        if (inZone) {
            if (it.pinnedTo !== cand.id) {
                // 进入新绑定：吸附到照片顶部 + 建立固定关系
                const at = it.attachmentType || 'pin';
                cand.pinned = true;
                cand.attachmentType = at;
                it.pinnedTo = cand.id;
                const phEl = this.stage.querySelector(`.wall-item[data-id="${cand.id}"]`);
                this._syncPinToPhoto(cand, phEl);          // 吸附到照片顶部中心
                if (phEl) {
                    phEl.classList.add('pinned', 'att-' + at);   // 照片进入固定态视觉
                    phEl.classList.add('pin-shake');             // 轻微晃动（收藏完成的仪式感）
                    setTimeout(() => phEl.classList.remove('pin-shake'), 600);
                }
                el.classList.add('pin-attached');           // 图钉弹跳吸附动画
                const rh = el.querySelector('.wall-rotate'); if (rh) rh.style.display = 'none';
                const sh = el.querySelector('.wall-scale');  if (sh) sh.style.display = 'none';
                // 首次固定 → 一次性教学弹窗；之后仅保留轻提示（不重复打扰）
                const isFirst = (() => { try { return localStorage.getItem('pinGuideShown') !== 'true'; } catch (e) { return true; } })();
                this._showPinGuide(at);
                if (!isFirst) this._toast('已固定到回忆墙 ❤️');
                this._refreshUnpinnedTags();                // 更新/收起首次引导
            } else {
                // 已绑定：图钉“钉在照片上”，继续贴合照片上沿
                const phEl = this.stage.querySelector(`.wall-item[data-id="${cand.id}"]`);
                this._syncPinToPhoto(cand, phEl);
            }
        } else if (it.pinnedTo) {
            // 拖离照片：解除绑定，照片恢复可移动
            const ph = this.data.find(d => d.id === it.pinnedTo);
            if (ph) {
                ph.pinned = false; ph.attachmentType = '';
                const phEl = this.stage.querySelector(`.wall-item[data-id="${ph.id}"]`);
                if (phEl) phEl.classList.remove('pinned', 'att-pin', 'att-magnet', 'att-tape');
            }
            it.pinnedTo = '';
            el.classList.remove('pin-attached');
            const rh = el.querySelector('.wall-rotate'); if (rh) rh.style.display = '';
            const sh = el.querySelector('.wall-scale');  if (sh) sh.style.display = '';
            this._refreshUnpinnedTags();
        }
    },

    /* 把已关联的图钉贴到照片的“相对锚点”上（分辨率 / 缩放无关）：
       图钉位置 = 照片中心 + 锚点偏移(按照片当前渲染宽高比例) - 上抬量(按图钉自身高度)。
       大 / 小尺寸、缩放、旋转后调用，图钉永远“钉在照片对应位置”，不再悬空。
       例：pinAnchor={x:0.5,y:0} → 照片顶部中心。*/
    _syncPinToPhoto(photo, photoEl) {
        if (!photo || !photoEl || !this.stage) return;
        const pin = this.data.find(d => d.type === 'pin' && d.pinnedTo === photo.id);
        if (!pin) return;
        const stageR = this.stage.getBoundingClientRect();
        if (!stageR.width || !stageR.height) return;
        // 用 offset 尺寸（不含 transform / 入场动画缩放）推算“真实渲染尺寸”：
        // 渲染尺寸 = offset × 用户 scale，并叠加 rotation 旋转后的包围盒
        // （w·|sinθ| + h·|cosθ|），从而避开 wallPop 入场动画(0.4→1)与图片未解码的过渡态，
        // 又能正确反映缩放与旋转后的实际占位——图钉在 DOM 入场的瞬间即可算对位置
        // （图片解码后由 decode/load/rAF 再同步一次高度）。
        const pscale = photo.scale || 1;
        const ow = (photoEl.offsetWidth || 0) * pscale;
        const oh = (photoEl.offsetHeight || 0) * pscale;
        // 图片尚未加载/解码（卡片坍塌）时跳过，避免把图钉锁死在错误位置；
        // 待图片 decode / load / rAF 重同步时会以真实尺寸重新计算。
        if (ow < 4 || oh < 4) return;
        const rad = (photo.rotation || 0) * Math.PI / 180;
        const cosR = Math.abs(Math.cos(rad)), sinR = Math.abs(Math.sin(rad));
        // 旋转后的真实渲染宽高（bounding box），与 getBoundingClientRect 一致但不含动画干扰
        const renderedW = ow * cosR + oh * sinR;
        const renderedH = ow * sinR + oh * cosR;
        const stageW = stageR.width, stageH = stageR.height;
        // 锚点（相对照片比例）：x:0.5,y:0 = 照片顶部中心
        const ax = (pin.pinAnchor && typeof pin.pinAnchor.x === 'number') ? pin.pinAnchor.x : 0.5;
        const ay = (pin.pinAnchor && typeof pin.pinAnchor.y === 'number') ? pin.pinAnchor.y : 0;
        // 照片渲染尺寸换算成“占舞台的百分比”，使锚点随照片大小动态变化（大/小尺寸自适应）
        const photoWPct = renderedW / stageW * 100;
        const photoHPct = renderedH / stageH * 100;
        const anchorXPct = (photo.x || 50) + (ax - 0.5) * photoWPct;
        const anchorYPct = (photo.y || 50) + (ay - 0.5) * photoHPct;
        // 图钉自身渲染高度（百分比）→ 仅当锚点在顶部(y:0)时上抬，让图钉“钩”住照片上沿
        const pinEl0 = this.stage.querySelector(`.wall-item[data-id="${pin.id}"]`);
        const pinScale = pin.scale || 1;
        const pinHPx = pinEl0 ? (pinEl0.offsetHeight || 0) * pinScale : (this.BASE.pin * pinScale);
        const pinHPct = pinHPx / stageH * 100;
        const liftPct = (ay <= 0.001) ? pinHPct * 0.3 : 0;
        pin.x = Math.max(0, Math.min(100, anchorXPct));
        pin.y = Math.max(0, Math.min(100, anchorYPct - liftPct));
        if (pinEl0) { pinEl0.style.left = pin.x + '%'; pinEl0.style.top = pin.y + '%'; }
    },

    /* ---------- 首次固定引导 ---------- */
    _maybeShowPinTip() {
        if (this._tipActive) return;
        try { if (localStorage.getItem('pawlaroid_wall_pin_tip') === '1') return; } catch (e) {}
        const unpinned = this.data.filter(d => d.type === 'polaroid' && !d.pinned);
        if (!unpinned.length) return;
        this._tipActive = true;
        // 未固定照片加角标（虚线 + “未固定”）
        unpinned.forEach(p => {
            const el = this.stage.querySelector(`.wall-item[data-id="${p.id}"]`);
            if (el) el.classList.add('unpinned');
        });
        const view = document.getElementById('view-wall');
        if (!view) return;
        const hint = document.createElement('div');
        hint.className = 'wall-pin-hint';
        hint.innerHTML =
            '<button class="wall-pin-hint-close" aria-label="知道了">×</button>' +
            '<div class="wall-pin-hint-arrow">↑</div>' +
            '<div class="wall-pin-hint-text">📌 选一枚图钉，拖到照片上，把回忆<strong>固定</strong>住吧</div>';
        hint.querySelector('.wall-pin-hint-close').addEventListener('click', () => this._dismissPinTip());
        view.appendChild(hint);
        this._pinTipEl = hint;
        this._tipTimer = setTimeout(() => this._dismissPinTip(), 12000); // 12s 后自动消失
    },

    /* 收起引导：移除角标 + 气泡，并记下“已看过”（仅首次） */
    _dismissPinTip() {
        this._tipActive = false;
        if (this._pinTipEl) { this._pinTipEl.remove(); this._pinTipEl = null; }
        if (this.stage) {
            this.stage.querySelectorAll('.wall-item.type-polaroid.unpinned').forEach(n => n.classList.remove('unpinned'));
        }
        try { localStorage.setItem('pawlaroid_wall_pin_tip', '1'); } catch (e) {}
        if (this._tipTimer) { clearTimeout(this._tipTimer); this._tipTimer = null; }
    },

    /* 固定一张照片后刷新角标；若已全部固定则收起引导 */
    _refreshUnpinnedTags() {
        if (!this._tipActive) return;
        const unpinned = this.data.filter(d => d.type === 'polaroid' && !d.pinned);
        if (this.stage) {
            this.stage.querySelectorAll('.wall-item.type-polaroid').forEach(n => n.classList.remove('unpinned'));
            unpinned.forEach(p => {
                const el = this.stage.querySelector(`.wall-item[data-id="${p.id}"]`);
                if (el) el.classList.add('unpinned');
            });
        }
        if (!unpinned.length) this._dismissPinTip();
    },

    /* ---------- 渲染 ---------- */
    _render() {
        if (!this.stage) return;
        this._load();
        // 清空仅 item 层（保留背景层）
        this.stage.querySelectorAll('.wall-item').forEach(n => n.remove());
        this.data.forEach(it => this.stage.appendChild(this._buildItem(it)));
        if (this.selectedId && !this.data.find(d => d.id === this.selectedId)) {
            this.selectedId = null;
        }
        // 渲染后按相对锚点重排已绑定图钉，保证大/小尺寸与缩放后图钉都贴合照片
        this._resyncBoundPins();
        // 兜底：rAF 后布局稳定（含已缓存图片）再同步一次，避免首帧坍塌尺寸把图钉锁死
        requestAnimationFrame(() => this._resyncBoundPins());
    },

    /* 把所有“已绑定”的图钉按各自照片的当前位置/尺寸重新吸附（载入/重渲染/切主题后调用） */
    _resyncBoundPins() {
        if (!this.stage) return;
        this.data.forEach(d => {
            if (d.type === 'polaroid' && d.pinned) {
                const phEl = this.stage.querySelector(`.wall-item[data-id="${d.id}"]`);
                if (phEl) this._syncPinToPhoto(d, phEl);
            }
        });
    },

    _buildItem(it) {
        const el = document.createElement('div');
        let cls = 'wall-item type-' + it.type + (it.id === this.selectedId ? ' selected' : '');
        if (it.type === 'polaroid' && it.pinned) {
            cls += ' pinned';                                  // 已固定：轻微“钉住”效果
            if (it.attachmentType) cls += ' att-' + it.attachmentType;  // 固定方式视觉（att-pin / att-magnet…）
        }
        if (it.type === 'pin' && it.pinnedTo) cls += ' pin-attached';     // 已吸附到照片
        if (it.type === 'pin' && it.attachmentType) cls += ' att-' + it.attachmentType;  // 装饰类型视觉（att-pin / att-magnet…）
        el.className = cls;
        el.dataset.id = it.id;
        const base = it.baseSize || this.BASE[it.type] || 120;
        // 小纸条：支持独立宽高调整（noteW / noteH）
        if (it.type === 'note') {
            const nw = (it.noteW || 1) * base;
            const nh = (it.noteH || 1) * base;
            el.style.width = nw + 'px';
            el.style.height = nh + 'px';
        } else {
            el.style.width = base + 'px';
        }
        el.style.left = it.x + '%';
        el.style.top = it.y + '%';
        el.style.setProperty('--r', it.rotation + 'deg');
        el.style.transform = `translate(-50%,-50%) rotate(${it.rotation}deg) scale(${it.scale})`;

        // 内容：小纸条用文字（显示 + 可编辑 textarea），其余用图片
        if (it.type === 'note') {
            this._buildNoteContent(it, el);
        } else {
            const img = document.createElement('img');
            img.className = 'wall-img';
            img.src = this._resolvePolaroidSrc(it);
            img.draggable = false;
            // 图片加载/解码完成后，照片真实尺寸才确定，重同步其关联图钉（相对锚点按真实尺寸计算）
            img.addEventListener('load', () => this._resyncBoundPins());
            img.addEventListener('error', () => this._resyncBoundPins());
            // decode() 对“已缓存/同步完成”与“异步解码”都能可靠回调，比 load 更稳
            if (img.decode) img.decode().then(() => this._resyncBoundPins()).catch(() => {});
            el.appendChild(img);
        }

        // 选中态手柄（缩放 / 旋转 / 删除）—— 所有物件共用
        const scaleH = document.createElement('div');
        scaleH.className = 'wall-handle wall-scale';
        scaleH.title = '拖动缩放';
        const rotH = document.createElement('div');
        rotH.className = 'wall-handle wall-rotate';
        rotH.title = '拖动旋转';
        const del = document.createElement('button');
        del.className = 'wall-del';
        del.innerHTML = '×';
        del.title = '移除';
        el.appendChild(scaleH);
        el.appendChild(rotH);
        el.appendChild(del);
        // 已吸附的图钉是“固定件”，不再提供旋转手柄（强调它是钉在照片上的工具）
        if (it.type === 'pin' && it.pinnedTo) rotH.style.display = 'none';
        // 已固定的照片：保留缩放 / 旋转手柄（固定态允许调尺寸、调角度），
        // 仅删除键含义变为“取消固定”（移除图钉、保留照片，恢复自由编辑）
        if (it.type === 'polaroid' && it.pinned) {
            del.title = '取消固定（移除图钉）';
        }

        // 交互：手柄优先，编辑态不拖拽，其余交给统一拖拽逻辑
        el.addEventListener('pointerdown', (e) => {
            // 已固定的照片：禁止普通拖动，但允许缩放 / 旋转 / 取消固定（删图钉）
            if (it.type === 'polaroid' && it.pinned) {
                this._select(it.id);
                if (e.target === del) { this._unpinPhoto(it.id); return; }          // 取消固定：移除图钉、保留照片
                if (e.target === scaleH) { this._startScale(e, it, el); return; }   // 允许调整尺寸
                if (e.target === rotH) { this._startRotate(e, it, el); return; }    // 允许旋转角度
                e.preventDefault();
                this._toast('这张回忆已固定，点左上角 × 取消图钉即可重新调整位置~');
                return;
            }
            if (e.target === scaleH) {
                // 小纸条 → 自由长宽调整；其他物件 → 等比缩放
                if (it.type === 'note') this._startNoteScale(e, it, el);
                else this._startScale(e, it, el);
                return;
            }
            if (e.target === rotH) { this._startRotate(e, it, el); return; }
            if (e.target === del) { this._remove(it.id); return; }
            if (it.type === 'note' && el.classList.contains('editing')) { e.stopPropagation(); return; }
            this._select(it.id);
            if (it.type === 'note') this._startDragNote(e, it, el);
            else this._startDrag(e, it, el);
        });
        return el;
    },

    /* 小纸条内容：默认显示文字；.editing 时显示 textarea 供输入 */
    _buildNoteContent(it, el) {
        const cls = (this.NOTE_COLORS[it.color] && this.NOTE_COLORS[it.color].cls) || 'note-cream';
        const note = document.createElement('div');
        note.className = 'wall-note ' + cls;

        const disp = document.createElement('div');
        disp.className = 'wall-note-display';
        disp.textContent = it.text || '点我写点什么…';

        const ta = document.createElement('textarea');
        ta.className = 'wall-note-edit';
        ta.placeholder = '写给它的小纸条…';
        ta.value = it.text || '';
        ta.addEventListener('input', () => {
            it.text = ta.value;
            disp.textContent = it.text || '点我写点什么…';
            this._save();
        });
        ta.addEventListener('blur', () => {
            el.classList.remove('editing');
            disp.textContent = it.text || '点我写点什么…';
            this._save();
        });
        // 编辑态下阻止 textarea 的 pointerdown 冒泡到 el，避免误触发拖拽
        ta.addEventListener('pointerdown', (e) => e.stopPropagation());

        note.appendChild(disp);
        note.appendChild(ta);
        el.appendChild(note);
    },

    /* 进入编辑态：展开 textarea 并聚焦 */
    _editNote(it, el) {
        const ta = el.querySelector('.wall-note-edit');
        if (!ta) return;
        el.classList.add('editing');
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
    },

    /* ---------- 选中 ---------- */
    _select(id) {
        this.selectedId = id;
        this.stage.querySelectorAll('.wall-item').forEach(n => {
            n.classList.toggle('selected', n.dataset.id === id);
        });
    },

    /* ---------- 拖拽（移动端 + PC 统一） ---------- */
    _startDrag(e, it, el) {
        e.preventDefault();
        const rect = this.stage.getBoundingClientRect();
        const startX = e.clientX, startY = e.clientY;
        const startL = it.x, startT = it.y;
        const move = (ev) => {
            const dx = (ev.clientX - startX) / rect.width * 100;
            const dy = (ev.clientY - startY) / rect.height * 100;
            it.x = Math.max(0, Math.min(100, startL + dx));
            it.y = Math.max(0, Math.min(100, startT + dy));
            el.style.left = it.x + '%';
            el.style.top = it.y + '%';
            // 固定态（不改动照片自身位移逻辑，仅让关联图钉跟随）：图钉随照片移动
            if (it.type === 'polaroid') this._syncPinToPhoto(it, el);
            // 图钉：在拖拽中实时检测与照片的吸附/绑定/解除（不改动通用拖拽算法）
            if (it.type === 'pin') this._updatePinBinding(it, el);
        };
        const up = (ev) => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            this._save();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    },

    /* 小纸条拖拽：与拍立得同一套位移算法；仅“轻点不移动”时进入编辑态 */
    _startDragNote(e, it, el) {
        e.preventDefault();
        const rect = this.stage.getBoundingClientRect();
        const startX = e.clientX, startY = e.clientY;
        const startL = it.x, startT = it.y;
        let moved = false;
        const move = (ev) => {
            if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) moved = true;
            const dx = (ev.clientX - startX) / rect.width * 100;
            const dy = (ev.clientY - startY) / rect.height * 100;
            it.x = Math.max(0, Math.min(100, startL + dx));
            it.y = Math.max(0, Math.min(100, startT + dy));
            el.style.left = it.x + '%';
            el.style.top = it.y + '%';
            // 固定态（不改动照片自身位移逻辑，仅让关联图钉跟随）：图钉随照片移动
            if (it.type === 'polaroid') this._syncPinToPhoto(it, el);
            // 图钉：在拖拽中实时检测与照片的吸附/绑定/解除（不改动通用拖拽算法）
            if (it.type === 'pin') this._updatePinBinding(it, el);
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            this._save();
            if (!moved) this._editNote(it, el); // 单击 = 编辑文字
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    },

    _startScale(e, it, el) {
        e.stopPropagation(); e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const startDist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
        const startScale = it.scale;
        const move = (ev) => {
            const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
            it.scale = Math.max(0.3, Math.min(3, startScale * (d / startDist)));
            el.style.transform = `translate(-50%,-50%) rotate(${it.rotation}deg) scale(${it.scale})`;
            if (it.type === 'polaroid') this._syncPinToPhoto(it, el);   // 缩放时图钉实时跟随锚点
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            // 照片缩放后，固定其上的图钉重新贴合上沿（不改变照片缩放逻辑）
            if (it.type === 'polaroid') this._syncPinToPhoto(it, el);
            this._save();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    },

    /* 小纸条自由长宽调整（右下角手柄）：横向拖动改宽度，纵向拖动改高度 */
    _startNoteScale(e, it, el) {
        e.stopPropagation(); e.preventDefault();
        const base = it.baseSize || this.BASE.note || 184;
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = it.noteW || 1;
        const startH = it.noteH || 1;
        const move = (ev) => {
            const dw = (ev.clientX - startX) / base;
            const dh = (ev.clientY - startY) / base;
            it.noteW = Math.max(0.4, Math.min(5, startW + dw));
            it.noteH = Math.max(0.4, Math.min(5, startH + dh));
            el.style.width = (it.noteW * base) + 'px';
            el.style.height = (it.noteH * base) + 'px';
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            this._save();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    },

    _startRotate(e, it, el) {
        e.stopPropagation(); e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        const startRot = it.rotation;
        const move = (ev) => {
            const a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
            it.rotation = startRot + (a - startAngle);
            el.style.transform = `translate(-50%,-50%) rotate(${it.rotation}deg) scale(${it.scale})`;
            if (it.type === 'polaroid') this._syncPinToPhoto(it, el);   // 旋转时图钉实时跟随锚点
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            // 照片旋转后，固定其上的图钉重新贴合上沿（不改变照片旋转逻辑）
            if (it.type === 'polaroid') this._syncPinToPhoto(it, el);
            this._save();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    },

    _remove(id) {
        const removed = this.data.find(d => d.id === id);
        // 删除图钉 → 解除照片固定态（不改变其他删除逻辑）
        if (removed && removed.type === 'pin' && removed.pinnedTo) {
            const ph = this.data.find(d => d.id === removed.pinnedTo);
            if (ph) {
                ph.pinned = false; ph.attachmentType = '';
                const phEl = this.stage.querySelector(`.wall-item[data-id="${ph.id}"]`);
                if (phEl) phEl.classList.remove('pinned', 'att-pin', 'att-magnet', 'att-tape');
            }
        }
        // 删除照片 → 一并移除其关联图钉（避免孤儿 pin 指向已删照片）
        if (removed && removed.type === 'polaroid') {
            this.data.filter(d => d.type === 'pin' && d.pinnedTo === id).forEach(pin => {
                const pinNode = this.stage.querySelector(`.wall-item[data-id="${pin.id}"]`);
                if (pinNode) pinNode.remove();
            });
            this.data = this.data.filter(d => !(d.type === 'pin' && d.pinnedTo === id));
        }
        this.data = this.data.filter(d => d.id !== id);
        if (this.selectedId === id) this.selectedId = null;
        this._save();
        const node = this.stage.querySelector(`.wall-item[data-id="${id}"]`);
        if (node) node.remove();
        this._refreshUnpinnedTags();
    },

    /* 取消固定：移除该照片关联的所有图钉（解绑）并恢复照片为自由编辑态。
       照片本身保留（与“删除照片”区分开，符合“取消图钉即可恢复自由编辑”）。 */
    _unpinPhoto(photoId) {
        const ph = this.data.find(d => d.id === photoId);
        if (!ph) return;
        // 移除关联图钉元素 + 数据
        this.data.filter(d => d.type === 'pin' && d.pinnedTo === photoId).forEach(pin => {
            const n = this.stage.querySelector(`.wall-item[data-id="${pin.id}"]`);
            if (n) n.remove();
        });
        this.data = this.data.filter(d => !(d.type === 'pin' && d.pinnedTo === photoId));
        // 照片恢复自由
        ph.pinned = false; ph.attachmentType = '';
        const phEl = this.stage.querySelector(`.wall-item[data-id="${photoId}"]`);
        if (phEl) {
            phEl.classList.remove('pinned', 'att-pin', 'att-magnet', 'att-tape');
            const sh = phEl.querySelector('.wall-scale'); if (sh) sh.style.display = '';
            const rh = phEl.querySelector('.wall-rotate'); if (rh) rh.style.display = '';
            const dl = phEl.querySelector('.wall-del'); if (dl) dl.title = '移除';
        }
        this._save();
        this._toast('已取消固定，现在可以重新调整啦～');
    },

    /* 首次固定教学弹窗（一次性）：pin / magnet 文案不同，点击“我知道了”后
       localStorage 记录 pinGuideShown=true，之后不再弹出。 */
    _showPinGuide(type) {
        try { if (localStorage.getItem('pinGuideShown') === 'true') return; } catch (e) {}
        const isMagnet = (type === 'magnet');
        const emoji = isMagnet ? '🧲' : '📌';
        const title = isMagnet ? '磁铁已吸附回忆' : '图钉已固定回忆';
        const body = isMagnet
            ? '吸附后的拍立得不会自由移动，<br>取消磁铁即可重新调整。'
            : '固定后的拍立得不会自由移动，<br>取消图钉即可重新调整。';
        const overlay = document.createElement('div');
        overlay.className = 'wall-pin-guide';
        overlay.innerHTML =
            '<div class="wall-pin-guide-card">' +
                '<div class="wall-pin-guide-emoji">' + emoji + '</div>' +
                '<div class="wall-pin-guide-title">' + title + '</div>' +
                '<div class="wall-pin-guide-text">' + body + '</div>' +
                '<button class="wall-pin-guide-ok">我知道了</button>' +
            '</div>';
        const close = () => {
            try { localStorage.setItem('pinGuideShown', 'true'); } catch (e) {}
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };
        overlay.querySelector('.wall-pin-guide-ok').addEventListener('click', close);
        overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
        const view = document.getElementById('view-wall') || document.body;
        view.appendChild(overlay);
    },

    _rand(min, max) { return Math.random() * (max - min) + min; },

    _toast(msg) {
        // App 在本项目是顶层 const（不挂 window），需用 typeof 判断而非 window.App
        if (typeof App !== 'undefined' && App.toast) App.toast(msg);
    }
};
