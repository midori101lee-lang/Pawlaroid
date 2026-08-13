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
        this._render();
    },

    /* 工具栏按钮绑定（🐾 贴纸 / 🧰 工具箱 / 浮动按钮 / 关闭面板） */
    _bindToolbar() {
        const stickerBtn = document.getElementById('wallBtnStickers');
        const toolBtn = document.getElementById('wallBtnTools');
        const fab = document.getElementById('wallFab');
        const menu = document.getElementById('wallFabMenu');
        if (stickerBtn) stickerBtn.addEventListener('click', () => this._togglePanel('sticker'));
        if (toolBtn) toolBtn.addEventListener('click', () => this._togglePanel('tool'));
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
        let showSticker = stickerOpen;
        let showTool = toolOpen;
        if (which === 'sticker') { showSticker = !stickerOpen; showTool = false; }
        else if (which === 'tool') { showTool = !toolOpen; showSticker = false; }
        else { showSticker = false; showTool = false; }
        this.stickerPanel.classList.toggle('open', showSticker);
        this.toolPanel.classList.toggle('open', showTool);
        // 展开选择面板时收起浮动工具菜单，避免遮挡
        const menu = document.getElementById('wallFabMenu');
        if (menu) menu.classList.remove('open');
        if (showSticker) this._fillStickers();
        if (showTool) this._fillTool();
    },

    /* 工具箱面板：图钉（颜色选择）+ 小纸条（颜色选择），二者分类展示 */
    _fillTool() {
        if (!this.toolPanel) return;
        // 图钉：从 window.PAW_PINS 渲染颜色列表
        const pinBox = this.toolPanel.querySelector('.wall-pin-list');
        if (pinBox) {
            pinBox.innerHTML = '';
            (window.PAW_PINS || []).forEach(p => {
                const el = document.createElement('button');
                el.className = 'wall-panel-item';
                el.innerHTML = `<img src="${p.file}" alt="${p.name}"><span>${p.name}</span>`;
                el.addEventListener('click', () => this._addDecor('pin', p));
                pinBox.appendChild(el);
            });
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

    /* 贴纸配置加载：优先 fetch ./stickers/stickers.json（http(s) 下改 JSON 刷新即生效），
       回退到 window.PAW_STICKERS（由 stickers.js 注入，file:// 友好）。 */
    async _loadStickerConfig() {
        let arr = (window.PAW_STICKERS || []).slice();
        if (typeof location !== 'undefined' &&
            (location.protocol === 'http:' || location.protocol === 'https:')) {
            try {
                const res = await fetch('./stickers/stickers.json', { cache: 'no-store' });
                if (res.ok) {
                    const json = await res.json();
                    if (Array.isArray(json) && json.length) arr = json;
                }
            } catch (e) { /* 离线 / file:// → 使用注入的 window.PAW_STICKERS */ }
        }
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
                el.innerHTML = `<img src="${s.image || s.file}" alt="${s.name}"><span>${s.name}</span>`;
                el.addEventListener('click', () => this._addDecor('sticker', s));
                box.appendChild(el);
            });
        };
        // 已加载则直接渲染；否则异步加载配置后渲染（确保 http 下读到最新 JSON）
        if (this._stickers) { render(this._stickers); return; }
        this._loadStickerConfig().then(() => render(this._stickers || window.PAW_STICKERS));
    },

    _addDecor(type, cfg) {
        this._load();
        const src = cfg.dataUri || cfg.image || cfg.file;   // 优先内联 dataURI（导出友好），回退路径
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
    },

    _buildItem(it) {
        const el = document.createElement('div');
        el.className = 'wall-item type-' + it.type + (it.id === this.selectedId ? ' selected' : '');
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

        // 交互：手柄优先，编辑态不拖拽，其余交给统一拖拽逻辑
        el.addEventListener('pointerdown', (e) => {
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
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
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
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            this._save();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    },

    _remove(id) {
        this.data = this.data.filter(d => d.id !== id);
        if (this.selectedId === id) this.selectedId = null;
        this._save();
        const node = this.stage.querySelector(`.wall-item[data-id="${id}"]`);
        if (node) node.remove();
    },

    _rand(min, max) { return Math.random() * (max - min) + min; },

    _toast(msg) {
        if (window.App && App.toast) App.toast(msg);
    }
};
