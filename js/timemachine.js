/* ============================================================
   timemachine.js — 时光机（浏览回忆，独立模块，不修改拍照流程）
   ------------------------------------------------------------
   定位：像翻一本“宠物成长手帐”。
     - 数据来自 window.PawMemory（每次被保留的拍立得）。
     - 按时间倒序展示“小型手帐页面”式回忆卡片（图片 / 日期 / 文字）。
     - 轻量手帐元素：胶带贴角、日期章、小爪印、小星星（纯展示，不编辑）。
     - 点击卡片进入详情：查看完整拍立得 / 原图 / 留言，可贴到展示墙。
     - 无回忆时显示温暖空状态。

   与展示墙的边界：
     时光机 = “浏览回忆”；展示墙 = “创造回忆”（贴纸/图钉/小纸条编辑）。
     二者数据互不耦合，时光机只读 PawMemory，不碰 Wall 的内部状态。
   ============================================================ */
// “特别事件”可选标签（与结果页保持一致）
const TM_EVENT_TAGS = ['第一次尝试', '开心瞬间', '搞怪行为', '出门玩耍', '特别纪念日'];

// 轻量元素创建辅助
function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

const TimeMachine = {
    timelineEl: null,
    emptyEl: null,
    detailEl: null,
    footerEl: null,
    _detailId: null,

    init() {
        this.timelineEl = document.getElementById('tmTimeline');
        this.emptyEl = document.getElementById('tmEmpty');
        this.detailEl = document.getElementById('tmDetail');
        this.footerEl = document.getElementById('tmFooter');
        // 顶部标题视觉：从统一配置（js/assets.js）取路径，避免硬编码
        const titleImg = document.getElementById('tmTitleImg');
        if (titleImg) {
            titleImg.src = (window.PAW_ASSETS && window.PAW_ASSETS.timeMachineTitle)
                || 'public-assets/titles/time-machine-title.webp';
        }
        this.render();
    },

    /* ---------- 渲染 ---------- */
    render() {
        if (!this.timelineEl) return;
        const list = (window.PawMemory ? PawMemory.all() : []).slice();
        // 按生成时间倒序（最新在最上）
        list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

        this.timelineEl.innerHTML = '';
        if (!list.length) {
            if (this.emptyEl) this.emptyEl.hidden = false;
            if (this.footerEl) this.footerEl.hidden = true;
            this.timelineEl.hidden = true;
            return;
        }
        if (this.emptyEl) this.emptyEl.hidden = true;
        if (this.footerEl) this.footerEl.hidden = false;
        this.timelineEl.hidden = false;

        // 标题与日期之间的手帐风分隔：棕色波浪线 + 居中爪印，填补标题下方留白
        this.timelineEl.appendChild(this._buildDivider());

        // 按“天”分组：同一天上传的拍立得，归到同一个居中横排模组里。
        const p = n => (n < 10 ? '0' + n : '' + n);
        const groups = {};
        list.forEach(rec => {
            const d = new Date(rec.date);
            const key = isNaN(d.getTime()) ? '未知日期' :
                `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
            (groups[key] = groups[key] || []).push(rec);
        });
        // 按天降序（最新的一天在最上）
        Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(dayKey => {
            this.timelineEl.appendChild(this._buildDayGroup(dayKey, groups[dayKey]));
        });
    },

    /* 一天的回忆：日期横条 + 居中横排的照片卡 */
    _buildDayGroup(dayKey, recs) {
        const wrap = document.createElement('div');
        wrap.className = 'tm-day';

        const label = document.createElement('div');
        label.className = 'tm-date tm-day-label';
        if (dayKey === '未知日期') {
            label.textContent = '未注明日期';
        } else {
            const [y, m, d] = dayKey.split('-');
            label.textContent = `${y}.${m}.${d}`;
        }
        wrap.appendChild(label);

        const row = document.createElement('div');
        row.className = 'tm-day-row';
        recs.forEach(rec => row.appendChild(this._buildPhotoCard(rec)));
        wrap.appendChild(row);
        return wrap;
    },

    /* 手帐风分隔条：左右波浪线，中间一只小爪印 */
    _buildDivider() {
        const d = document.createElement('div');
        d.className = 'tm-divider';
        const paw = document.createElement('span');
        paw.className = 'tm-divider-paw';
        d.appendChild(paw);
        return d;
    },

    _buildPhotoCard(rec) {
        const card = document.createElement('div');
        card.className = 'tm-photo-card';
        card.dataset.id = rec.id;

        const paper = document.createElement('div');
        paper.className = 'tm-paper';
        // 每张纸条轻微随机倾斜，模拟手帐随手贴的真实感
        paper.style.setProperty('--tilt', (Math.random() * 4 - 2).toFixed(2) + 'deg');

        // 轻量装饰（纯展示）
        const tape = el('div', 'tm-tape');
        const star = el('div', 'tm-star', '✦');
        const paw = el('div', 'tm-paw', '🐾');

        // 删除按钮（垃圾桶图标，放在右侧特别事件列最底部）
        const delBtn = document.createElement('button');
        delBtn.className = 'tm-delete-btn';
        delBtn.innerHTML = '🗑️ 删除';
        delBtn.title = '删除这张回忆';
        delBtn.type = 'button';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof App !== 'undefined' && App.deleteMemory) {
                App.deleteMemory(rec.id);
            }
        });

        // 拍立得照片（点击照片 → 打开详情，可贴到展示墙）
        const photo = document.createElement('div');
        photo.className = 'tm-photo';
        const img = document.createElement('img');
        img.src = rec.image;
        img.alt = '拍立得回忆';
        img.draggable = false;
        photo.appendChild(img);

        // —— 标题：展示态（手写 + ✒️ + 棕色波浪线）→ 点击进入编辑态 ——
        let titleVal = (rec.title && rec.title.trim()) ? rec.title.trim() : '日常陪伴';
        const titleWrap = document.createElement('div');
        titleWrap.className = 'tm-title-wrap';
        const titleText = el('span', 'tm-title-text', titleVal);
        const titleEdit = el('button', 'tm-title-edit', '✒️');
        titleEdit.type = 'button';
        titleEdit.title = '编辑标题';
        titleWrap.appendChild(titleText);
        titleWrap.appendChild(titleEdit);

        // 编辑态 input（默认隐藏，点击 ✒️/标题 才出现）
        const titleInput = document.createElement('input');
        titleInput.className = 'tm-title-input';
        titleInput.maxLength = 30;
        titleInput.style.display = 'none';
        const enterTitleEdit = () => {
            titleInput.value = titleVal === '日常陪伴' ? '' : titleVal;
            titleWrap.style.display = 'none';
            titleInput.style.display = 'block';
            titleInput.focus();
        };
        const commitTitle = () => {
            const v = titleInput.value.trim();
            const saved = v || '日常陪伴';
            PawMemory.update(rec.id, { title: saved });
            titleVal = saved;
            titleText.textContent = saved;
            titleInput.style.display = 'none';
            titleWrap.style.display = 'flex';
        };
        titleEdit.addEventListener('click', e => { e.stopPropagation(); enterTitleEdit(); });
        titleText.addEventListener('click', e => { e.stopPropagation(); enterTitleEdit(); });
        titleInput.addEventListener('click', e => e.stopPropagation());
        titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); } });
        titleInput.addEventListener('blur', commitTitle);

        // 左：今日小记（爪印列表 + 添加）
        const noteCol = document.createElement('div');
        noteCol.className = 'tm-note-col';
        const noteLabel = el('div', 'story-label', '🐾 今日小记');
        const noteList = document.createElement('ul');
        noteList.className = 'tm-note-list';
        const noteAdd = el('button', 'tm-note-add', '＋ 添加');
        noteAdd.type = 'button';

        const renderNotes = () => {
            noteList.innerHTML = '';
            const notes = Array.isArray(rec.note) ? rec.note : [];
            notes.forEach((txt, i) => {
                const li = document.createElement('li');
                li.className = 'tm-note-item';
                const span = el('span', 'tm-note-text', txt);
                const del = el('button', 'tm-note-del', '×');
                del.type = 'button'; del.title = '删除这条';
                // 点击文字 → 行内编辑
                const editItem = () => {
                    const inp = document.createElement('input');
                    inp.className = 'tm-note-edit';
                    inp.value = txt; inp.maxLength = 120;
                    li.replaceChildren(inp);
                    inp.focus();
                    const saveItem = () => {
                        if (inp._done) return;
                        inp._done = true;
                        const v = inp.value.trim();
                        const arr = (Array.isArray(rec.note) ? rec.note : []).slice();
                        if (v) arr[i] = v; else arr.splice(i, 1);
                        PawMemory.update(rec.id, { note: arr });
                        rec.note = arr;
                        renderNotes();
                    };
                    inp.addEventListener('blur', saveItem);
                    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
                    inp.addEventListener('click', e => e.stopPropagation());
                };
                span.addEventListener('click', e => { e.stopPropagation(); editItem(); });
                del.addEventListener('click', e => {
                    e.stopPropagation();
                    const arr = (Array.isArray(rec.note) ? rec.note : []).slice();
                    arr.splice(i, 1);
                    PawMemory.update(rec.id, { note: arr });
                    rec.note = arr;
                    renderNotes();
                });
                li.appendChild(span);
                li.appendChild(del);
                noteList.appendChild(li);
            });
            // “添加”按钮始终在列表末尾
            noteAdd.onclick = e => {
                e.stopPropagation();
                const inp = document.createElement('input');
                inp.className = 'tm-note-edit';
                inp.placeholder = '写点什么…'; inp.maxLength = 120;
                noteList.appendChild(inp);
                inp.focus();
                const addItem = () => {
                    if (inp._done) return;
                    inp._done = true;
                    const v = inp.value.trim();
                    if (v) {
                        const arr = (Array.isArray(rec.note) ? rec.note : []).slice();
                        arr.push(v);
                        PawMemory.update(rec.id, { note: arr });
                        rec.note = arr;
                    }
                    renderNotes();
                };
                inp.addEventListener('blur', addItem);
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
                inp.addEventListener('click', e => e.stopPropagation());
            };
        };
        renderNotes();
        noteCol.appendChild(noteLabel);
        noteCol.appendChild(noteList);
        noteCol.appendChild(noteAdd);

        // 右：特别事件（贴纸标签，多选切换，自动保存）
        const tagCol = document.createElement('div');
        tagCol.className = 'tm-tag-col';
        const tagLabel = el('div', 'story-label', '✨ 特别事件');
        const tagWrap = document.createElement('div');
        tagWrap.className = 'tm-tag-chips';
        const activeTags = (Array.isArray(rec.tags) ? rec.tags : []);
        TM_EVENT_TAGS.forEach(t => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'tag-chip' + (activeTags.indexOf(t) >= 0 ? ' active' : '');
            chip.textContent = t;
            chip.addEventListener('click', e => {
                e.stopPropagation();
                chip.classList.toggle('active');
                const sel = [];
                tagWrap.querySelectorAll('.tag-chip.active').forEach(c => sel.push(c.textContent));
                PawMemory.update(rec.id, { tags: sel });
            });
            tagWrap.appendChild(chip);
        });
        tagCol.appendChild(tagLabel);
        tagCol.appendChild(tagWrap);


        // 棕色手绘波浪线：独立整行，位于标题下方
        // （之前错误地塞进 .tm-title-wrap 的 flex 行，被压成 0 宽而不可见）
        const titleWave = el('div', 'tm-title-wave');

        paper.appendChild(tape);
        paper.appendChild(star);
        paper.appendChild(photo);
        paper.appendChild(titleWrap);
        paper.appendChild(titleInput);
        paper.appendChild(titleWave);
        paper.appendChild(paw);

        // 三栏从左到右：今日小记 | 拍立得 | 特别事件
        card.appendChild(noteCol);
        card.appendChild(paper);
        card.appendChild(tagCol);

        // 删除按钮：卡片右下角（特别事件列方位，对齐拍立得底部），绝对定位脱离三栏 flex
        card.appendChild(delBtn);
        img.addEventListener('click', e => {
            e.stopPropagation();
            this.openDetail(rec.id);
        });
        return card;
    },

    /* ---------- 详情 ---------- */
    openDetail(id) {
        if (!this.detailEl || !window.PawMemory) return;
        const rec = PawMemory.get(id);
        if (!rec) return;
        this._detailId = id;

        const img = document.getElementById('tmDetailImg');
        if (img) img.src = rec.image;
        const dt = document.getElementById('tmDetailDate');
        if (dt) dt.textContent = this._formatDate(rec.date).full;
        const tx = document.getElementById('tmDetailText');
        if (tx) {
            const label = (rec.title && rec.title.trim()) ||
                (rec.text && rec.text.trim()) ||
                (rec.petName ? `和 ${rec.petName} 的回忆 🐾` : '一段温暖的小回忆');
            tx.textContent = label;
        }
        const note = document.getElementById('tmDetailNote');
        if (note) {
            note.innerHTML = '';
            const notes = Array.isArray(rec.note) ? rec.note : [];
            notes.forEach(n => {
                const item = el('div', 'tm-detail-note-item', '🐾 ' + n);
                note.appendChild(item);
            });
        }
        const tags = document.getElementById('tmDetailTags');
        if (tags) {
            tags.innerHTML = '';
            (Array.isArray(rec.tags) ? rec.tags : []).forEach(tag => {
                const chip = document.createElement('span');
                chip.className = 'tm-tag-chip';
                chip.textContent = '✨ ' + tag;
                tags.appendChild(chip);
            });
        }
        const add = document.getElementById('tmDetailAdd');
        if (add) {
            // 原图/拍立得切换：点击照片在两者间切换
            const photo = this.detailEl.querySelector('.tm-detail-photo');
            if (photo) {
                photo.onclick = () => {
                    if (!img) return;
                    img.dataset.mode = img.dataset.mode === 'orig' ? 'polaroid' : 'orig';
                    img.src = img.dataset.mode === 'orig' && rec.originalImage ? rec.originalImage : rec.image;
                };
            }
            add.onclick = () => this._sendToWall(rec);
        }
        this.detailEl.hidden = false;
    },

    closeDetail() {
        if (this.detailEl) this.detailEl.hidden = true;
        this._detailId = null;
    },

    /* 把这条回忆贴到展示墙（复用 Wall 既有能力，不新增编辑逻辑） */
    _sendToWall(rec) {
        try {
            if (typeof Wall !== 'undefined') {
                Wall.addPolaroid(rec.id, rec.image);
                if (window.PawMemory) PawMemory.markOnWall(rec.id);
                if (typeof App !== 'undefined') App.goWall();
            }
        } catch (e) {
            console.warn('[TimeMachine] 贴到展示墙失败', e);
        }
    },

    /* ---------- 工具 ---------- */
    _formatDate(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return { dot: '', full: '' };
        const p = n => (n < 10 ? '0' + n : '' + n);
        return {
            dot: `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`,
            full: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
        };
    }
};
