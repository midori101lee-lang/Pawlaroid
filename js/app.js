/* ========================================
   App.js - Pawlaroid 主控制器
   完整流程：首页 → 上传 → 1:1裁剪 → 胶片配方 + 相纸选择 → 显影 → 手写签名 → 保存
   数据流：
     uploadedImage (仅初始化裁剪)
         ↓
     croppedImage (裁剪结果，唯一后续数据源)
         ↓
     processedCanvas (胶片配方处理结果)
         ↓
     finalPolaroid (相纸 PNG overlay + 手写签名)
   ======================================== */

const App = {

    /* 版本戳：每次修复后递增，打开控制台或设置面板即可确认是否加载到最新代码 */
    VERSION: '2026-08-12-tmfreeze',

    /* 用户反馈问卷地址（腾讯问卷）。集中配置，未来替换问卷只改这一处。 */
    FEEDBACK_URL: 'https://wj.qq.com/s2/27566557/at8w/',

    /* 存入 localStorage 的拍立得最大边长（px）。
       展示墙/时光机显示约 196~588px，560px 已足够清晰；
       远小于 700px 可显著减少体积，避免 localStorage(约5MB) 配额很快耗尽
       —— 这是“导入旧数据后新生成传不上去”的根因（每张照片被存了两份且过大）。 */
    STORE_MAX: 560,

    state: {
        currentView: 'home',
        imageElement: null,        // uploadedImage —— 仅用于初始化裁剪
        croppedImage: null,        // 裁剪结果，唯一后续数据源
        petType: 'cat',
        petName: '',
        selectedRecipe: 'pawClassic',
        selectedPaper: 'classic_white',  // 当前相纸样式（id 与 frames 派生一致）
        processedCanvas: null,
        handwritingCanvas: null,   // 手写留言 buffer（仅笔迹，透明背景，预览用）
        /* 手写留言快照（data URL PNG，独立图层，导出/预览统一使用）
           不再重新读取 live canvas，避免 buffer 被清空/重置后丢失内容 */
        signatureImage: '',
        /* 手写图层变换参数（拍立得原生坐标 1254x1254 体系）
           offsetX/offsetY：相对默认签名区中心的偏移（原生 px）
           scale：相对默认大小的倍数（1 = 铺满签名区）
           rotation：旋转角度（度），限制在 -5° ~ 5° */
        hwTransform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 },
        /* 照片日期（仅作为数据保留，用于"照片回忆确认页面"展示 + 未来成长日记扩展）
           不再绘制到拍立得图片上。
           mode: 'today' | 'custom' | 'none' —— 不依赖照片上传时间
           custom: 'YYYY-MM-DD'（仅 mode==='custom' 使用） */
        photoDate: { mode: 'today', custom: '' },
        /* 纯净拍立得底图缓存（photo + 胶片质感 + 相纸 PNG，不含日期/手写）
           显影完成后生成一次，回忆确认页与结果页/导出共用，避免重复渲染 */
        basePolaroid: null,
        /* 显影阶段共享进度（0..1）：移动端摇一摇 / 电脑端拖动 / 自动兜底 都写入此变量 */
        developmentProgress: 0,
        /* 最近一次生成的完整拍立得（basePolaroid + 手写）dataURL，供展示墙/时光机复用 */
        lastPolaroidDataURL: '',
        /* 返回栈：用于各页面“返回上一页”按钮，避免分散维护 */
        _backStack: [],
        /* 当前这一代拍立得的唯一 id（每次显影重置），用于时光机按 id 累积记录、不互相覆盖 */
        currentMemoryId: '',
        /* 拍立得标题（可编辑，默认“日常陪伴”）、今日小记、特别事件标签 ——
           轻量故事字段，让用户给照片加“背后的故事感”，不设计成宠物管理系统 */
        title: '',
        note: '',
        tags: []
    },

    /* 开发模式调试开关 */
    debugMode: true,
    debug(tag, extra) {
        if (!this.debugMode) return;
        const msg = '[Pawlaroid✓] ' + tag;
        if (extra !== undefined) console.log(msg, extra);
        else console.log(msg);
    },

    dom: {},

    async init() {
        this.cacheDom();
        this._loadPetInfo();
        this.bindEvents();
        this.renderRecipeList();
        // 打印版本戳，方便确认浏览器是否加载到最新代码（排除缓存假象）
        console.log('[Pawlaroid] 已加载版本', this.VERSION);

        // 动态加载相纸清单（frames.json），每次刷新自动读取最新资源
        await PaperStyles.load();
        // 若当前选择无效，回退到默认相纸（经典白边）
        if (!PaperStyles.findById(this.state.selectedPaper)) {
            this.state.selectedPaper = PaperStyles.getDefaultId();
        }
        this.renderPaperList();

        // 同步初始相纸帧到所有拍立得 img（预览/显影/结果）
        this.updatePaperFrame(this.dom.recipeFrameBg);
        this.updatePaperFrame(this.dom.developFrameBg);
        this.updatePaperFrame(this.dom.resultFrameBg);

        // 绑定手写留言调整模式的手势与滑块
        this.setupHwAdjust();

        // 初始化照片日期印记 UI（默认态 + 自定义默认值 + 预览同步）
        this.initPhotoDateUI();

        // 回收展示墙里重复的拍立得大图（改为引用记忆），释放 localStorage 配额
        this._reclaimWallStorage();
            // 懒压缩已存储的旧 PNG 大图回忆 → 小 JPEG，释放配额，避免新照片写不进时光机
            this._compressLegacyMemories();
            // 裁剪已存储旧拍立得的白边（相框 PNG 透明边距产生的多余暖白边框）
            this._cropLegacyPolaroids();

        // 首页“最近一张”侧边浮窗：支持拖拽移动
        this._initHomeRecentDrag();

        // 首屏资源就绪，移除 loading 遮罩（避免白屏，见 index.html #appLoading）
        this._hideLoading();
    },

    /* 首屏 loading 遮罩：init 完成后移除。复用 index.html 内联的 window.__hideLoading
       （带淡出动画 + 6s 异常兜底），保证任何路径都能隐藏遮罩 */
    _hideLoading() {
        if (typeof window.__hideLoading === 'function') {
            window.__hideLoading();
            return;
        }
        const el = document.getElementById('appLoading');
        if (el) el.remove();
    },

    cacheDom() {
        this.dom = {
            views: {
                home: document.getElementById('view-home'),
                upload: document.getElementById('view-upload'),
                pet: document.getElementById('view-pet'),
                crop: document.getElementById('view-crop'),
                recipe: document.getElementById('view-recipe'),
                develop: document.getElementById('view-develop'),
                memory: document.getElementById('view-memory'),
                result: document.getElementById('view-result'),
                wall: document.getElementById('view-wall'),
                timemachine: document.getElementById('view-timemachine'),
                handwrite: document.getElementById('view-handwrite'),
                adjust: document.getElementById('view-adjust')
            },
            uploadZone: document.getElementById('uploadZone'),
            uploadPrompt: document.getElementById('uploadPrompt'),
            uploadPreview: document.getElementById('uploadPreview'),
            previewImg: document.getElementById('previewImg'),
            fileInput: document.getElementById('fileInput'),
            petNameInput: document.getElementById('petNameInput'),
            btnToCrop: document.getElementById('btnToCrop'),
            recipeList: document.getElementById('recipeList'),
            recipePreviewCanvas: document.getElementById('recipePreviewCanvas'),
            recipeFrameBg: document.getElementById('recipeFrameBg'),
            recipeTag: document.getElementById('recipeTag'),
            paperList: document.getElementById('paperList'),
            developCanvas: document.getElementById('developCanvas'),
            developFrameBg: document.getElementById('developFrameBg'),
            developingCard: document.getElementById('developingCard'),
            developFlash: document.getElementById('developFlash'),
            developLabel: document.getElementById('developLabel'),
            developHint: document.getElementById('developHint'),
            developTip: document.getElementById('developTip'),
            resultCanvas: document.getElementById('resultCanvas'),
            resultFrameBg: document.getElementById('resultFrameBg'),
            resultPolaroidWrap: document.getElementById('resultPolaroidWrap'),
            resultPetName: document.getElementById('resultPetName'),
            resultDate: document.getElementById('resultDate'),
            resultTitle: document.getElementById('resultTitle'),
            resultNote: document.getElementById('resultNote'),
            handwriteCanvas: document.getElementById('handwriteCanvas'),
            handwriteBigCanvas: document.getElementById('handwriteBigCanvas'),
            toast: document.getElementById('toast'),
            // 调整模式
            adjustPolaroid: document.getElementById('adjustPolaroid'),
            adjustPhotoCanvas: document.getElementById('adjustPhotoCanvas'),
            adjustHwLayer: document.getElementById('adjustHwLayer'),
            adjustHwCanvas: document.getElementById('adjustHwCanvas'),
            adjustScale: document.getElementById('adjustScale'),
            adjustRotate: document.getElementById('adjustRotate'),
            // 照片回忆确认页
            memoryCanvas: document.getElementById('memoryCanvas'),
            memoryTextCanvas: document.getElementById('memoryTextCanvas'),
            memoryPolaroidWrap: document.getElementById('memoryPolaroidWrap')
        };
    },

    bindEvents() {
        this.dom.uploadZone.addEventListener('click', () => {
            if (!this.state.imageElement) this.dom.fileInput.click();
        });

        this.dom.fileInput.addEventListener('change', (e) => {
            this.handleFile(e.target.files[0]);
        });

        this.dom.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dom.uploadZone.classList.add('dragover');
        });

        this.dom.uploadZone.addEventListener('dragleave', () => {
            this.dom.uploadZone.classList.remove('dragover');
        });

        this.dom.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) this.handleFile(e.dataTransfer.files[0]);
        });
    },

    switchView(viewName, opts) {
        const target = this.dom.views[viewName];
        // 防御：视图不存在时仅告警并保留当前视图，避免清空所有 view-active 导致整页空白
        if (!target) {
            console.warn('[Pawlaroid] switchView: 未知视图 ->', viewName);
            return;
        }
        opts = opts || {};
        // 非“返回”导航时，把当前视图压入返回栈，供各页面“返回上一页”使用
        if (!opts._fromBack && this.state.currentView && this.state.currentView !== viewName) {
            this.state._backStack.push(this.state.currentView);
            if (this.state._backStack.length > 30) this.state._backStack.shift();
        }
        Object.values(this.dom.views).forEach(v => { if (v) v.classList.remove('view-active'); });
        target.classList.add('view-active');
        this.state.currentView = viewName;
        target.scrollTop = 0;
        this._syncNav(viewName);
    },

    /**
     * 返回上一页面（编辑页 / 展示墙 / 时光机 / 手写页的返回按钮统一走这里）。
     * 栈为空时退回首页。
     */
    _goBack() {
        const prev = this.state._backStack.pop();
        if (prev && this.dom.views[prev]) {
            this.switchView(prev, { _fromBack: true });
        } else {
            this.goHome();
        }
    },

    /**
     * 同步底部导航：仅在 首页 / 时光机 / 展示墙 三个主视图显示；
     * 创作流程（上传/裁剪/显影/结果/手写等）隐藏，避免干扰既有拍照流程。
     */
    _syncNav(view) {
        const nav = document.getElementById('tabBar');
        if (!nav) return;
        const show = (view === 'home' || view === 'timemachine' || view === 'wall');
        document.body.classList.toggle('nav-on', show);
        nav.querySelectorAll('.tab-item').forEach(b => {
            b.classList.toggle('tab-active', b.dataset.view === view);
        });
    },

    goHome() { this.switchView('home'); this.renderHomeRecent(); },

    /* 首页"最近一张"回忆预览：读取统一记忆库最新一条（首页 = memories 最新一张） */
    renderHomeRecent() {
        const el = document.getElementById('homeRecent');
        if (!el) return;
        const rec = (typeof PawMemory !== 'undefined') ? PawMemory.latest() : null;
        if (!rec || !rec.image) { el.hidden = true; return; }
        el.hidden = false;
        const img = el.querySelector('.home-recent-img');
        if (img) img.src = rec.image;
        // 导航由拖拽 handler 统一处理，这里不再设 onclick
    },

    /* 首页"最近一张"浮窗拖拽：按住拖到任意位置，轻点跳转时光机 */
    _initHomeRecentDrag() {
        const el = document.getElementById('homeRecent');
        if (!el) return;

        let startX, startY, startLeft, startTop;
        let dragging = false, moved = false;
        const threshold = 4; // 移动超过此 px 才算拖拽

        const onDown = (e) => {
            dragging = true;
            moved = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            // 切到 inline left/top（覆盖 CSS right），关过渡避免拖拽卡顿
            el.style.transition = 'none';
            el.style.right = 'auto';
            el.style.left = startLeft + 'px';
            el.style.top = startTop + 'px';

            // 拖拽时轻微"抬起"效果
            el.style.boxShadow = '0 12px 24px rgba(255,164,92,0.32)';
            el.style.transform = 'scale(1.06)';

            el.setPointerCapture(e.pointerId);
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) moved = true;
            if (!moved) return;

            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            const newLeft = Math.max(0, Math.min(vw - w, startLeft + dx));
            const newTop = Math.max(0, Math.min(vh - h, startTop + dy));
            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
        };

        const onUp = (e) => {
            if (!dragging) return;
            dragging = false;

            // 还原过渡与阴影（CSS transition 恢复）
            el.style.transition = '';
            el.style.boxShadow = '';
            el.style.transform = '';

            // 没拖 = 轻点 → 跳转时光机
            if (!moved) {
                App.goTimemachine();
            }
        };

        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);

        // 禁止浏览器默认滚动/缩放手势吞掉拖拽
        el.style.touchAction = 'none';
        el.style.userSelect = 'none';
    },
    goUpload() { this.switchView('upload'); },

    goCrop() {
        if (!this.state.imageElement) {
            this.toast('请先上传照片');
            this.goUpload();
            return;
        }
        this.switchView('crop');
        setTimeout(() => {
            Cropper.init(this.state.imageElement);
        }, 100);
    },

    goRecipe() {
        if (!this.state.imageElement) {
            this.toast('请先上传照片');
            this.goUpload();
            return;
        }
        // 裁剪步骤：从裁剪模块一次性生成 croppedImage（croppedImage = 800x800 正方形）
        this.state.croppedImage = Cropper.getCroppedCanvas(800);
        this.switchView('recipe');
        // 切换相纸 PNG 帧
        this.updatePaperFrame(this.dom.recipeFrameBg);
        setTimeout(() => {
            this.renderRecipePreview();
        }, 100);
    },

    handleFile(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            this.toast('请选择图片文件');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.state.imageElement = img;
                this._resetPetInfo();
                this.dom.previewImg.src = e.target.result;
                this.dom.uploadPrompt.style.display = 'none';
                this.dom.uploadPreview.style.display = 'block';
                this.dom.btnToCrop.disabled = false;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    resetUpload() {
        this.state.imageElement = null;
        this.state.croppedImage = null;
        this.state.processedCanvas = null;
        this.dom.previewImg.src = '';
        this.dom.uploadPrompt.style.display = 'block';
        this.dom.uploadPreview.style.display = 'none';
        this.dom.btnToCrop.disabled = true;
        this.dom.fileInput.value = '';
    },

    selectPetType(type) {
        this.state.petType = type;
        document.querySelectorAll('.pet-type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        this._persistPetInfo();
    },

    /* ---------- 宠物信息（元数据，仅用于体验，不绘制到照片） ---------- */
    goPet() {
        this.switchView('pet');
        // 同步 UI 到当前状态
        document.querySelectorAll('.pet-type-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.type === this.state.petType);
        });
        if (this.dom.petNameInput) this.dom.petNameInput.value = this.state.petName || '';
    },

    setPetName(value) {
        this.state.petName = (value || '').trim();
        this._persistPetInfo();
    },

    /** 拍立得标题（可编辑，替换原固定“日常陪伴”配方名）。空值由 _recordMemory 兜底为“日常陪伴”。 */
    setTitle(value) {
        this.state.title = (value || '').trim();
    },

    /** 今日小记：一句话故事（轻量，不强制）。 */
    setNote(value) {
        this.state.note = (value || '').trim();
    },

    /** 特别事件标签：在预设集中多选切换（第一次尝试/开心瞬间/搞怪行为/出门玩耍/特别纪念日）。 */
    toggleTag(tag) {
        if (!Array.isArray(this.state.tags)) this.state.tags = [];
        const i = this.state.tags.indexOf(tag);
        if (i >= 0) this.state.tags.splice(i, 1);
        else this.state.tags.push(tag);
        // 同步按钮高亮状态（结果页标签芯片）
        const chip = document.querySelector('.tag-chip[data-tag="' + CSS.escape(tag) + '"]');
        if (chip) chip.classList.toggle('active', this.state.tags.indexOf(tag) >= 0);
    },

    _persistPetInfo() {
        try {
            localStorage.setItem('pawlaroid_pet', JSON.stringify({
                petType: this.state.petType,
                petName: this.state.petName
            }));
        } catch (e) { /* localStorage 不可用时忽略 */ }
    },

    _loadPetInfo() {
        try {
            const raw = localStorage.getItem('pawlaroid_pet');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                if (data.petType) this.state.petType = data.petType;
                if (typeof data.petName === 'string') this.state.petName = data.petName;
            }
        } catch (e) { /* 解析失败忽略 */ }
    },

    _resetPetInfo() {
        this.state.petType = 'cat';
        this.state.petName = '';
        if (this.dom.petNameInput) this.dom.petNameInput.value = '';
        try { localStorage.removeItem('pawlaroid_pet'); } catch (e) {}
    },

    /* ---------- 胶片配方列表 ---------- */
    renderRecipeList() {
        const list = this.dom.recipeList;
        list.innerHTML = '';
        FilmRecipes.definitions.forEach(recipe => {
            const item = document.createElement('div');
            item.className = 'recipe-item' + (recipe.id === this.state.selectedRecipe ? ' active' : '');
            item.dataset.recipeId = recipe.id;
            item.innerHTML = `
                <div class="recipe-swatch" style="background: ${FilmRecipes.getSwatchStyle(recipe)}"></div>
                <div class="recipe-info">
                    <div class="recipe-name-row">
                        <span class="recipe-name">${recipe.nameCn}</span>
                        <span class="recipe-name-en">${recipe.name}</span>
                    </div>
                    <div class="recipe-desc">${recipe.description}</div>
                </div>
                <div class="recipe-check"></div>
            `;
            item.addEventListener('click', () => this.selectRecipe(recipe.id));
            list.appendChild(item);
        });
    },

    selectRecipe(recipeId) {
        this.state.selectedRecipe = recipeId;
        document.querySelectorAll('.recipe-item').forEach(item => {
            item.classList.toggle('active', item.dataset.recipeId === recipeId);
        });
        this.renderRecipePreview();
    },

    /* ---------- 相纸样式列表 ---------- */
    renderPaperList() {
        const list = this.dom.paperList;
        list.innerHTML = '';
        const papers = PaperStyles.getAll();
        papers.forEach(paper => {
            const item = PaperStyles.renderListItem(paper);
            if (paper.id === this.state.selectedPaper) item.classList.add('active');
            item.addEventListener('click', () => this.selectPaper(paper.id));
            list.appendChild(item);
        });
    },

    selectPaper(paperId) {
        this.state.selectedPaper = paperId;
        document.querySelectorAll('.paper-item').forEach(item => {
            item.classList.toggle('active', item.dataset.paperId === paperId);
        });
        // 立即更新预览中的相纸 PNG 帧
        this.updatePaperFrame(this.dom.recipeFrameBg);
        this.renderRecipePreview();
    },

    /**
     * 更新指定 img 元素的 src 为当前相纸 PNG
     */
    updatePaperFrame(imgEl) {
        if (!imgEl) return;
        const paper = PaperStyles.findById(this.state.selectedPaper);
        if (paper) imgEl.src = paper.file;
    },

    /* ---------- 照片日期（仅作数据，用于回忆文案 + 未来成长日记） ---------- */

    /** 今天日期的 ISO 字符串 YYYY-MM-DD */
    todayISO() {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    },

    /** 选择日期模式：今天 / 自定义 / 不添加（不再绘制到图片，仅用于回忆文案） */
    setPhotoDateMode(mode) {
        if (!['today', 'custom', 'none'].includes(mode)) return;
        this.state.photoDate.mode = mode;
        document.querySelectorAll('.date-mode-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        // 自定义模式：若尚未填日期，默认用今天
        if (mode === 'custom' && !this.state.photoDate.custom) {
            this.state.photoDate.custom = this.todayISO();
            const inp = document.getElementById('dateCustomInput');
            if (inp) inp.value = this.state.photoDate.custom;
        }
        this.refreshDateControls();
    },

    /** 自定义日期变更 */
    setCustomDate(value) {
        this.state.photoDate.custom = value || '';
    },

    /** 结果编辑页：日期输入变更（写入所选日期，供时光机时间轴排序） */
    setPhotoDate(value) {
        this.state.photoDate.mode = value ? 'custom' : 'today';
        this.state.photoDate.custom = value || '';
        if (typeof this.updateMemoryText === 'function') this.updateMemoryText();
    },

    /** 根据当前模式显示/隐藏 自定义日期输入 */
    refreshDateControls() {
        const mode = this.state.photoDate.mode;
        const customBox = document.getElementById('dateCustomInput');
        if (customBox) customBox.style.display = (mode === 'custom') ? 'block' : 'none';
    },

    /** 初始化日期设置 UI（默认态 + 自定义输入框默认值） */
    initPhotoDateUI() {
        if (!this.state.photoDate.custom) this.state.photoDate.custom = this.todayISO();
        const inp = document.getElementById('dateCustomInput');
        if (inp) inp.value = this.state.photoDate.custom;
        this.refreshDateControls();
    },

    /**
     * 计算日期文本（Diary 格式：2026年8月10日），不添加则空串
     * 仅用于"照片回忆确认页面"展示，不写入最终图片。
     */
    getDiaryDateText() {
        const pd = this.state.photoDate;
        if (pd.mode === 'none') return '';
        let date;
        if (pd.mode === 'today') {
            date = new Date();
        } else if (pd.mode === 'custom' && pd.custom) {
            // 解析 'YYYY-MM-DD'，按本地时间 00:00 处理，避免时区偏移
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pd.custom);
            if (m) date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        }
        if (!(date instanceof Date) || isNaN(date.getTime())) date = new Date();
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    },

    /**
     * 生成"照片回忆"文案（仅在页面展示，不合成进图片）
     * 示例：
     *   "2026年8月10日，为TA拍下了一张照片 🐾"
     *   "2026年8月10日，为奶糖拍下了一张照片 🐾"
     *   "为奶糖拍下了一张照片 🐾"（未选日期时）
     */
    /* ---------- 配方预览（PNG 相纸 + 照片 canvas） ---------- */
    renderRecipePreview() {
        if (!this.state.croppedImage) return;

        const recipe = FilmRecipes.definitions.find(r => r.id === this.state.selectedRecipe);
        this.dom.recipeTag.textContent = recipe.nameCn;

        const processedCanvas = FilmRecipes.process(
            this.state.croppedImage, this.state.selectedRecipe, 300
        );

        if (processedCanvas) {
            // 照片 canvas 画布尺寸：320x300（与 polaroid 照片洞比例一致 887:831）
            const previewCtx = this.dom.recipePreviewCanvas.getContext('2d');
            const W = 320, H = 300;
            this.dom.recipePreviewCanvas.width = W;
            this.dom.recipePreviewCanvas.height = H;

            // cover 模式铺满
            const pw = processedCanvas.width;
            const ph = processedCanvas.height;
            const targetRatio = W / H;
            const srcRatio = pw / ph;
            let sx, sy, sw, sh;
            if (srcRatio > targetRatio) {
                sh = ph;
                sw = ph * targetRatio;
                sx = (pw - sw) / 2;
                sy = 0;
            } else {
                sw = pw;
                sh = pw / targetRatio;
                sx = 0;
                sy = (ph - sh) / 2;
            }
            previewCtx.drawImage(processedCanvas, sx, sy, sw, sh, 0, 0, W, H);
        }
    },

    /* ---------- 显影 ---------- */
    startDeveloping() {
        if (!this.state.croppedImage) {
            this.toast('请先上传照片');
            return;
        }
        // 新照片：每次显影都从干净状态开始（重置手写留言、图层变换、底图缓存）
        if (typeof Handwriting !== 'undefined' && Handwriting._setup) {
            try { Handwriting.reset(); } catch (e) {}
        }
        this.state.handwritingCanvas = null;
        this.state.signatureImage = '';
        this.state.hwTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
        this.state.basePolaroid = null;
        // 显影文案融入宠物名字（宠物信息仅作体验提示，不绘制到照片）
        const petName = this.state.petName || '';
        Developing.stages[0].label = petName ? `正在为 ${petName} 冲洗这一刻...` : '照片正在慢慢出现…';
        Developing.stages[0].hint = petName ? `给 ${petName} 的回忆正在感光` : '相纸正在悄悄感光';
        Developing.stages[1].label = petName ? `${petName} 的样子正在浮现…` : '它的样子正在浮现…';
        this.switchView('develop');

        // 同步显影页相纸 PNG 帧
        this.updatePaperFrame(this.dom.developFrameBg);

        this.state.processedCanvas = FilmRecipes.process(
            this.state.croppedImage, this.state.selectedRecipe, 800
        );

        if (!this.state.processedCanvas) {
            this.toast('处理失败，请重试');
            return;
        }

        Developing.init(
            this.state.processedCanvas,
            this.dom.developCanvas,
            () => this.onDevelopComplete(),
            (progress, stage) => this.onDevelopProgress(progress, stage)
        );

        setTimeout(() => Developing.start(), 400);
        /* 按设备挂载跨设备交互（摇一摇 / 拖动），共享 developmentProgress */
        this.setupDevelopInteraction();
    },

    onDevelopProgress(progress, stage) {
        this.dom.developLabel.textContent = stage.label;
        this.dom.developHint.textContent = stage.hint;
    },

    onDevelopComplete() {
        // 完成提示：petName 存在时个性化，否则保持原样
        const petName = (this.state.petName || '').trim();
        this.dom.developLabel.textContent = petName ? `${petName} 的拍立得完成啦 🐾` : '显影完成 🐾';
        this.dom.developHint.textContent = petName ? `${petName} 的拍立得已经冲洗好啦🐾` : '这张小小的回忆保存好啦🐾';

        // 轻微闪光 + 定影（相纸最后稳稳定格）
        const flash = this.dom.developFlash;
        const card = this.dom.developingCard;
        if (flash) {
            flash.classList.remove('flash-on');
            void flash.offsetWidth; // 强制回流，确保动画可重放
            flash.classList.add('flash-on');
        }
        if (card) {
            card.classList.remove('is-fixed');
            void card.offsetWidth;
            card.classList.add('is-fixed');
        }

        // 为这一代拍立得分配唯一 id（用于时光机按 id 累积记录，互不覆盖）
        this.state.currentMemoryId = 'mem_' + Date.now() + '_' + Math.floor(Math.random() * 1e4);
        // 新的一代拍立得：重置轻量故事字段，避免上一张的标题/小记/标签串场
        this.state.title = '';
        this.state.note = '';
        this.state.tags = [];
        // 显影完成直接进入“编辑回忆页面”（不再经过中间确认页 / 二级选择浮层）
        setTimeout(() => this.goResult(), 1100);
    },

    /* ---------- 跨设备显影交互 ---------- */
    /**
     * 按设备类型挂载交互：
     * - 移动端：摇一摇（DeviceMotionEvent）提升 developmentProgress
     * - 电脑端：按住照片左右拖动提升 developmentProgress，不显示摇一摇提示
     * 两者都写入同一共享变量 this.state.developmentProgress。
     * 自动兜底（10s 完成）由 Developing 内部负责，无需此处干预。
     */
    setupDevelopInteraction() {
        this.teardownDevelopInteraction();
        this.state.developmentProgress = 0;

        const isMobile = ('DeviceMotionEvent' in window) &&
            window.matchMedia('(pointer: coarse)').matches;

        if (isMobile) {
            this._setupShake();
        } else {
            this._setupDrag();
        }
    },

    /** 移动端：摇晃检测（含 iOS 13+ 权限请求） */
    _setupShake() {
        const tip = this.dom.developTip;
        if (tip) {
            tip.textContent = '📳 摇一摇手机，让它快快显影～';
            tip.style.display = '';
        }

        this._shakeHandler = (e) => {
            const a = e.accelerationIncludingGravity || e.acceleration;
            if (!a) return;
            const mag = Math.sqrt(
                Math.pow(a.x || 0, 2) + Math.pow(a.y || 0, 2) + Math.pow(a.z || 0, 2)
            );
            /* 静止时重力约 9.8，偏离越大代表晃动越强 */
            const dev = Math.abs(mag - 9.8);
            if (dev > 2.5) {
                const intensity = Math.max(0, Math.min(1, (dev - 2.5) / 8));
                Developing.addShake(intensity);
            }
        };

        const attach = () => window.addEventListener('devicemotion', this._shakeHandler);

        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
            /* iOS 13+ 需在用户手势中请求权限（startDeveloping 由点击触发） */
            try {
                DeviceMotionEvent.requestPermission().then((state) => {
                    if (state === 'granted') attach();
                }).catch(() => {});
            } catch (_) { /* 忽略，桌面端不会走到这里 */ }
        } else {
            attach();
        }
    },

    /** 电脑端：按住拍立得照片区域左右拖动，拖动距离转为显影进度 */
    _setupDrag() {
        const tip = this.dom.developTip;
        if (tip) {
            /* 不显示摇一摇提示，改为拖动提示 */
            tip.textContent = '🖱 按住照片左右拖动，亲手冲洗这一刻～';
            tip.style.display = '';
        }

        const card = this.dom.developingCard;
        if (!card) return;

        let dragging = false;
        let lastX = 0;

        this._dragStart = (e) => {
            dragging = true;
            lastX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            card.classList.add('is-grabbing');
        };
        this._dragMove = (e) => {
            if (!dragging) return;
            const x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            const dx = x - lastX;
            lastX = x;
            Developing.addDrag(dx);
        };
        this._dragEnd = () => {
            dragging = false;
            card.classList.remove('is-grabbing');
        };

        card.addEventListener('mousedown', this._dragStart);
        card.addEventListener('touchstart', this._dragStart, { passive: true });
        window.addEventListener('mousemove', this._dragMove);
        window.addEventListener('touchmove', this._dragMove, { passive: true });
        window.addEventListener('mouseup', this._dragEnd);
        window.addEventListener('touchend', this._dragEnd);
    },

    /** 卸载所有显影交互监听，重置提示 */
    teardownDevelopInteraction() {
        const tip = this.dom && this.dom.developTip;
        if (tip) tip.style.display = 'none';

        if (this._shakeHandler) {
            window.removeEventListener('devicemotion', this._shakeHandler);
            this._shakeHandler = null;
        }
        if (this._dragStart || this._dragMove || this._dragEnd) {
            const card = this.dom && this.dom.developingCard;
            if (card) {
                card.removeEventListener('mousedown', this._dragStart);
                card.removeEventListener('touchstart', this._dragStart);
                card.classList.remove('is-grabbing');
            }
            window.removeEventListener('mousemove', this._dragMove);
            window.removeEventListener('touchmove', this._dragMove);
            window.removeEventListener('mouseup', this._dragEnd);
            window.removeEventListener('touchend', this._dragEnd);
            this._dragStart = this._dragMove = this._dragEnd = null;
        }
    },


    /* ---------- 照片回忆确认页 ---------- */
    /**
     * 显影完成后进入"照片回忆确认页"：
     * 上方展示纯净拍立得预览（无日期），下方生成一段回忆文案。
     * 文案仅供页面展示，不写入最终图片；petName / date 数据保留供未来成长日记扩展。
     */
    async goMemory() {
        // 离开显影页：卸载跨设备交互监听，避免泄漏
        this.teardownDevelopInteraction();
        // 新照片生成，重置手写留言与图层变换（仅此处重置一次）
        if (Handwriting._setup) Handwriting.reset();
        this.state.handwritingCanvas = null;
        this.state.signatureImage = '';
        this.state.hwTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
        this.state.basePolaroid = null; // 重新构建纯净底图
        this.switchView('memory');
        await this.renderMemory();
    },

    /** 构建纯净拍立得底图（photo + 胶片质感 + 相纸 PNG，不含日期/手写），缓存复用 */
    async buildPurePolaroid() {
        const paper = PaperStyles.findById(this.state.selectedPaper) || PaperStyles.getAll()[0];
        // 仓库公开版：相纸走 paper.file（assets/ 同源路径），导出同源不污染画布。
        const __AC = window.ASSET_CONFIG;
        const __defaultFrame = (__AC && typeof __AC.resolve === 'function')
            ? __AC.resolve('frames/classic_white.webp')
            : 'assets/frames/classic_white.webp';
        const paperSrc = (paper && paper.dataUri) ? paper.dataUri : (paper ? paper.file : __defaultFrame);
        return Polaroid.render(this.state.processedCanvas, {
            paperFile: paperSrc
        });
    },

    async renderMemory() {
        if (!this.state.processedCanvas) return;
        if (!this.state.basePolaroid) {
            this.state.basePolaroid = await this.buildPurePolaroid();
        }

        // 拍立得整体为相纸自然比例（正方形），canvas 与容器同宽
        const cw = this.dom.memoryCanvas.clientWidth
            || (this.dom.memoryPolaroidWrap && this.dom.memoryPolaroidWrap.clientWidth)
            || 280;
        const dpr = window.devicePixelRatio || 1;
        const px = Math.round(cw * dpr);

        // 底层：照片 + 相纸边框（纯净，无文字）
        const base = this.dom.memoryCanvas;
        base.width = px;
        base.height = px;
        const bctx = base.getContext('2d');
        bctx.clearRect(0, 0, px, px);
        bctx.drawImage(
            this.state.basePolaroid,
            0, 0, Polaroid.FRAME_WIDTH, Polaroid.FRAME_HEIGHT,
            0, 0, px, px
        );

        // 上层：宠物名 / 日期 / 回忆文字（仅展示，不写入导出图）
        this.renderMemoryTextLayer(px);
    },

    /** 在拍立得白色留白区绘制回忆文字（文字层位于相纸之上） */
    renderMemoryTextLayer(px) {
        const tcv = this.dom.memoryTextCanvas;
        if (!tcv) return;
        const size = px || tcv.width;
        if (!size) return;
        tcv.width = size;
        tcv.height = size;
        const ctx = tcv.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        this.drawMemoryText(ctx, size);
    },

    /**
     * 把回忆文字绘制到拍立得底部白色区域内。
     * 层级：底层照片 → 中层相纸边框 → 上层本文字层。
     * 文字居中、不覆盖照片，使用暖棕主题色。
     */
    drawMemoryText(ctx, px) {
        const S = px / Polaroid.FRAME_WIDTH;          // 原生坐标 → 实际像素
        const petName = (this.state.petName || '').trim();
        const who = petName || 'TA';
        const dateStr = this.getDiaryDateText();

        // 三行：宠物名 → 日期 → 回忆句
        // 字号按白区高度（~70 css px）收紧，保证 3 行可读且不溢出相纸底边
        const lines = [];
        lines.push({ text: `🐾 ${who}`, size: 46, color: '#6D4A33', weight: 600 });
        if (dateStr) lines.push({ text: dateStr, size: 38, color: '#9A7A5A', weight: 400 });
        lines.push({ text: `为${who}拍下了一张照片 🐾`, size: 38, color: '#6D4A33', weight: 500 });

        // 白色留白区：照片底边 ~958 到 相纸底边 1254（约占整体 24%）
        const photoBottom = Polaroid.PHOTO_Y + Polaroid.PHOTO_H;
        const whiteBottom = Polaroid.FRAME_HEIGHT;
        const gap = 62;                                // 行间距（原生 px）
        const blockH = (lines.length - 1) * gap;
        // 整体稍向上偏移，避免 emoji 与底边贴得太近
        const centerY = (photoBottom + whiteBottom) / 2 - 14;
        let y = (centerY - blockH / 2) * S;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = (Polaroid.FRAME_WIDTH / 2) * S;

        lines.forEach(l => {
            ctx.font = `${l.weight} ${Math.round(l.size * S)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
            ctx.fillStyle = l.color;
            ctx.fillText(l.text, cx, y);
            y += gap * S;
        });
    },

    /** 仅重绘文字层（宠物名/日期变化时调用） */
    updateMemoryText() {
        this.renderMemoryTextLayer();
    },

    /* ---------- 结果页 ---------- */
    async goResult() {
        this.switchView('result');
        // 同步相纸 PNG 帧
        this.updatePaperFrame(this.dom.resultFrameBg);
        this._prefillResultMeta();
        await this.renderResult();
        // 生成完成即创建/更新当前 Memory（统一数据模型：时光机 / 展示墙 / 首页 共享）。
        // 按 currentMemoryId 幂等合并：此处先记录无手写版本，用户写完字或上墙时再合并更新。
        // 同时让展示墙“自动出现”（V19 需求：生成拍立得后展示墙自动出现，关联 Memory id，幂等）：
        // 用户写完字再点“展示墙/时光机”按钮时用含手写版覆盖同 memoryId 条目，不会重复上墙。
        try {
            const canvas = await this.buildFinalPolaroid();
            if (canvas) {
                const url = this._downsample(canvas, this.STORE_MAX);
                this._recordMemory(url, true);   // 已自动上墙 → onWall=true
                this.state.lastPolaroidDataURL = url;
                if (typeof Wall !== 'undefined') Wall.addPolaroid(this.state.currentMemoryId, url);
            }
        } catch (e) {
            // 极端环境兜底：某些浏览器在 file:// 下把相框合成到 canvas 后会“污染画布”，
            // 导致 toDataURL() 抛 SecurityError 而整段记忆创建中断（时光机/展示墙全空）。
            // 降级为“纯照片”（processedCanvas 来自用户上传的 dataURI，永不污染）记录，
            // 保证时光机 / 展示墙至少有内容，而不是整页空白。
            try {
                const url = this._downsample(this.state.processedCanvas, this.STORE_MAX);
                if (url) {
                    this._recordMemory(url, true);
                    this.state.lastPolaroidDataURL = url;
                    if (typeof Wall !== 'undefined') Wall.addPolaroid(this.state.currentMemoryId, url);
                    console.warn('[Result] 相框合成失败，已降级为纯照片记录', e && e.message);
                }
            } catch (_) {
                console.warn('[Result] 记录回忆失败（不影响页面展示）', e);
            }
        }
    },

    /** 预填结果编辑页的宠物名字与日期（取自既有状态，避免重复填写） */
    _prefillResultMeta() {
        if (this.dom.resultPetName) this.dom.resultPetName.value = this.state.petName || '';
        if (this.dom.resultDate) {
            const pd = this.state.photoDate;
            this.dom.resultDate.value = (pd && pd.mode === 'custom' && pd.custom) ? pd.custom : this.todayISO();
        }
        // 轻量故事字段回填（新照片为空 → 占位提示；同一次编辑返回保留已填内容）
        if (this.dom.resultTitle) this.dom.resultTitle.value = this.state.title || '';
        if (this.dom.resultNote) this.dom.resultNote.value = this.state.note || '';
        if (typeof document !== 'undefined') {
            document.querySelectorAll('.tag-chip').forEach(chip => {
                const t = chip.dataset.tag || '';
                chip.classList.toggle('active', (this.state.tags || []).indexOf(t) >= 0);
            });
        }
    },

    async renderResult() {
        if (!this.state.processedCanvas) return;

        // 复用已构建的纯净底图（回忆确认页已生成）
        if (!this.state.basePolaroid) {
            this.state.basePolaroid = await this.buildPurePolaroid();
        }

        /* 在结果页 canvas 显示照片区域（底图已含相纸 PNG） */
        const displayCanvas = this.dom.resultCanvas;
        const displayW = 320, displayH = 300;
        displayCanvas.width = displayW;
        displayCanvas.height = displayH;
        const ctx = displayCanvas.getContext('2d');
        // 从拍立得画布中取出照片区域（裁剪后坐标）
        const photo = Polaroid.getPhotoRegion();
        ctx.drawImage(
            this.state.basePolaroid,
            photo.x, photo.y, photo.w, photo.h,
            0, 0, displayW, displayH
        );

        /* 手写 overlay 画布（覆盖拍立得白边签名区）
           内部分辨率与 Handwriting buffer 一致，便于 1:1 映射 */
        this.renderHandwritingToResult();
    },

    /**
     * 把当前手写快照画到结果页的 overlay（按原始比例落在白边签名区）
     * 同时应用 hwTransform，使结果预览与最终导出一致
     */
    renderHandwritingToResult() {
        const hw = this.dom.handwriteCanvas;
        if (!hw) return;
        hw.width = Handwriting.BUFFER_W;
        hw.height = Handwriting.BUFFER_H;
        const hctx = hw.getContext('2d');
        hctx.clearRect(0, 0, hw.width, hw.height);
        // 应用图层变换（位置 / 大小 / 旋转）到 overlay 元素
        this.applyTransformToOverlay(hw, this.dom.resultPolaroidWrap);

        if (!this.state.signatureImage) return;
        const img = new Image();
        img.onload = () => {
            // 图片加载完成后再绘制，避免空白/异步未就绪
            hctx.clearRect(0, 0, hw.width, hw.height);
            hctx.drawImage(img, 0, 0, hw.width, hw.height);
        };
        img.onerror = () => this.toast('手写渲染失败，请重新尝试🐾');
        img.src = this.state.signatureImage;
    },

    /**
     * 把一个绝对定位的 overlay 元素按 hwTransform 应用 CSS transform
     * @param {HTMLElement} overlay - 已落在默认签名区的 overlay
     * @param {HTMLElement} container - 拍立得容器（用于推算显示比例）
     */
    applyTransformToOverlay(overlay, container) {
        if (!overlay || !container) return;
        const d = (container.clientWidth || 280) / Polaroid.FRAME_WIDTH; // 屏幕 px / 原生 px
        const t = this.state.hwTransform;
        overlay.style.transformOrigin = '50% 50%';
        overlay.style.transform =
            `translate(${t.offsetX * d}px, ${t.offsetY * d}px) ` +
            `rotate(${t.rotation}deg) scale(${t.scale})`;
    },

    /* ---------- 手写模式：打开 / 关闭 ---------- */
    openHandwrite() {
        if (!this.state.processedCanvas) {
            this.toast('请先生成照片');
            return;
        }
        // 首次打开时初始化手写引擎（一次性绑定事件）
        if (!Handwriting._setup) {
            Handwriting.setup(this.dom.handwriteBigCanvas);
        } else {
            Handwriting.show();
        }
        // 若已有留言，载入供继续编辑
        if (this.state.handwritingCanvas) {
            Handwriting.loadBuffer(this.state.handwritingCanvas);
        }
        // 个性化手写提示（不使用宠物名字作为图片图层）
        // petName 存在时把"它"替换为真实名字；为空时保持"它"
        const sub = document.getElementById('handwriteSub');
        if (sub) {
            sub.textContent = this.state.petName
                ? `给 ${this.state.petName} 留句话吧 🐾`
                : '给它留句话吧 🐾';
        }
        this.switchView('handwrite');
    },

    closeHandwrite(save) {
        if (save) {
            // 把笔迹 buffer 快照为独立图片（data URL），作为后续合成的唯一来源
            const buf = Handwriting.getBuffer();
            if (this.handwritingHasContent(buf)) {
                try {
                    this.state.signatureImage = buf.toDataURL('image/png');
                    this.debug('手写Canvas生成成功', 'dataURL len=' + this.state.signatureImage.length);
                } catch (e) {
                    this.debug('手写 toDataURL 失败', e.message);
                    this.toast('手写保存失败，请重新尝试🐾');
                    this.switchView('result');
                    return;
                }
                this.state.handwritingCanvas = buf; // 仅用于实时预览
                // 写完后进入“调整模式”，让用户自由摆放手写字。
                // 调整页是编辑流程的延续：返回时应直接回到编辑页(result)，
                // 故先弹出手写页栈帧，使 adjust 的 _goBack 落到 result 而非 handwrite。
                if (this.state._backStack[this.state._backStack.length - 1] === 'handwrite') {
                    this.state._backStack.pop();
                }
                this.goAdjust({ fromHandwrite: true });
                return;
            }
        }
        this._goBack();
    },

    /* 判断某个手写 buffer 是否有实际笔迹（非空） */
    handwritingHasContent(buf) {
        if (!buf || !buf.width || !buf.height) return false;
        const ctx = buf.getContext('2d');
        const data = ctx.getImageData(0, 0, buf.width, buf.height).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) return true;
        }
        return false;
    },

    /* 把 signatureImage（data URL）包装成加载完成的 Image，供绘制使用 */
    getSignatureImage() {
        return new Promise((resolve, reject) => {
            if (!this.state.signatureImage) {
                reject(new Error('signatureImage 为空'));
                return;
            }
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('手写图片加载失败'));
            img.src = this.state.signatureImage;
        });
    },

    /* ========================================
       手写留言调整模式
       图层结构：photo layer + polaroid frame + handwriting layer
       handwriting layer 保存 position(offsetX,offsetY) / scale / rotation
       ======================================== */

    /**
     * 进入调整模式：展示完整拍立得 + 可自由摆放的手写图层
     */
    async goAdjust(opts) {
        if (!this.state.handwritingCanvas) {
            this.toast('先写句话吧');
            return;
        }
        // 从手写页续接进入时，不把 handwrite 再压入返回栈（保证“调整页返回→编辑页”）
        this.switchView('adjust', opts && opts.fromHandwrite ? { _fromBack: true } : undefined);
        // 等待布局完成，确保容器尺寸已就绪
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        this.renderAdjustBase();
        this._syncHwSliders();
        this.applyHwTransformToLayer();
    },

    /**
     * 渲染调整页底图（纯净拍立得，不含手写/日期）与手写图层
     */
    async renderAdjustBase() {
        if (!this.state.processedCanvas) return;

        // 复用已构建的纯净底图（回忆确认页已生成）
        if (!this.state.basePolaroid) {
            this.state.basePolaroid = await this.buildPurePolaroid();
        }
        const polaroidCanvas = this.state.basePolaroid;

        const dpr = window.devicePixelRatio || 1;
        const container = this.dom.adjustPolaroid;
        const cw = container.clientWidth || 280;

        // 1) 照片 + 相纸底图
        const photo = this.dom.adjustPhotoCanvas;
        photo.width = Math.round(cw * dpr);
        photo.height = Math.round(cw * dpr);
        const pctx = photo.getContext('2d');
        pctx.clearRect(0, 0, photo.width, photo.height);
        pctx.drawImage(
            polaroidCanvas, 0, 0, Polaroid.FRAME_WIDTH, Polaroid.FRAME_HEIGHT,
            0, 0, photo.width, photo.height
        );

        // 2) 手写图层（快照图片按 100% 落到默认签名区尺寸，变换由 CSS transform 控制）
        this._hw.d = cw / Polaroid.FRAME_WIDTH;
        const layerW = cw * (Polaroid.SIG_W / Polaroid.FRAME_WIDTH);
        const layerH = cw * (Polaroid.SIG_H / Polaroid.FRAME_HEIGHT);
        const hw = this.dom.adjustHwCanvas;
        hw.width = Math.round(layerW * dpr);
        hw.height = Math.round(layerH * dpr);
        const hctx = hw.getContext('2d');
        hctx.clearRect(0, 0, hw.width, hw.height);
        if (this.state.signatureImage) {
            const img = new Image();
            img.onload = () => {
                hctx.clearRect(0, 0, hw.width, hw.height);
                hctx.drawImage(img, 0, 0, hw.width, hw.height);
            };
            img.onerror = () => this.toast('手写渲染失败，请重新尝试🐾');
            img.src = this.state.signatureImage;
        }
    },

    /**
     * 绑定调整模式的滑块与手势（仅一次）
     */
    setupHwAdjust() {
        const layer = this.dom.adjustHwLayer;
        if (!layer || this._hwSetup) return;

        this._hw = { pointers: new Map(), drag: null, gesture: null, d: 1 };

        // 滑块：大小 / 旋转
        this.dom.adjustScale.addEventListener('input', (e) => {
            this.state.hwTransform.scale = Number(e.target.value);
            this.applyHwTransformToLayer();
        });
        this.dom.adjustRotate.addEventListener('input', (e) => {
            this.state.hwTransform.rotation = Number(e.target.value);
            this.applyHwTransformToLayer();
        });

        // 指针手势：单指拖动 / 双指缩放旋转
        layer.addEventListener('pointerdown', (e) => this._hwPointerDown(e));
        layer.addEventListener('pointermove', (e) => this._hwPointerMove(e));
        layer.addEventListener('pointerup', (e) => this._hwPointerUp(e));
        layer.addEventListener('pointercancel', (e) => this._hwPointerUp(e));

        this._hwSetup = true;
    },

    _hwPointerDown(e) {
        e.preventDefault();
        const layer = this.dom.adjustHwLayer;
        try { layer.setPointerCapture(e.pointerId); } catch (_) {}
        this._hw.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        layer.classList.add('active');

        if (this._hw.pointers.size === 1) {
            this._hw.drag = { x: e.clientX, y: e.clientY };
            this._hw.gesture = null;
        } else if (this._hw.pointers.size === 2) {
            this._hw.gesture = this._buildGesture();
            this._hw.drag = null;
        }
    },

    _buildGesture() {
        const pts = [...this._hw.pointers.values()];
        const [a, b] = pts;
        const dx = b.x - a.x, dy = b.y - a.y;
        return {
            dist: Math.hypot(dx, dy),
            angle: Math.atan2(dy, dx) * 180 / Math.PI,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            t: { ...this.state.hwTransform }
        };
    },

    _hwPointerMove(e) {
        if (!this._hw.pointers.has(e.pointerId)) return;
        e.preventDefault();
        this._hw.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this._hw.pointers.size >= 2 && this._hw.gesture) {
            const g = this._hw.gesture;
            const pts = [...this._hw.pointers.values()];
            const [a, b] = pts;
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

            let scale = g.t.scale * (dist / g.dist);
            scale = Math.min(2.5, Math.max(0.4, scale));
            let rotation = g.t.rotation + (angle - g.angle);
            rotation = Math.min(5, Math.max(-5, rotation));
            let offsetX = g.t.offsetX + (mid.x - g.mid.x) / this._hw.d;
            let offsetY = g.t.offsetY + (mid.y - g.mid.y) / this._hw.d;
            offsetX = this._clampOffsetX(offsetX);
            offsetY = this._clampOffsetY(offsetY);

            this.state.hwTransform.scale = scale;
            this.state.hwTransform.rotation = rotation;
            this.state.hwTransform.offsetX = offsetX;
            this.state.hwTransform.offsetY = offsetY;

            this.applyHwTransformToLayer();
            this._syncHwSliders();
        } else if (this._hw.pointers.size === 1 && this._hw.drag) {
            const dx = e.clientX - this._hw.drag.x;
            const dy = e.clientY - this._hw.drag.y;
            this._hw.drag.x = e.clientX;
            this._hw.drag.y = e.clientY;
            let offsetX = this.state.hwTransform.offsetX + dx / this._hw.d;
            let offsetY = this.state.hwTransform.offsetY + dy / this._hw.d;
            offsetX = this._clampOffsetX(offsetX);
            offsetY = this._clampOffsetY(offsetY);
            this.state.hwTransform.offsetX = offsetX;
            this.state.hwTransform.offsetY = offsetY;
            this.applyHwTransformToLayer();
        }
    },

    _hwPointerUp(e) {
        this._hw.pointers.delete(e.pointerId);
        try { this.dom.adjustHwLayer.releasePointerCapture(e.pointerId); } catch (_) {}
        if (this._hw.pointers.size === 1) {
            // 双指退回单指：重置拖拽起点，清除手势
            const p = [...this._hw.pointers.values()][0];
            this._hw.drag = { x: p.x, y: p.y };
            this._hw.gesture = null;
        } else if (this._hw.pointers.size === 0) {
            this.dom.adjustHwLayer.classList.remove('active');
            this._hw.drag = null;
            this._hw.gesture = null;
        }
    },

    _clampOffsetX(x) {
        const baseCx = Polaroid.SIG_X + Polaroid.SIG_W / 2;
        const cx = baseCx + x;
        return Math.min(1134, Math.max(120, cx)) - baseCx;
    },
    _clampOffsetY(y) {
        const baseCy = Polaroid.SIG_Y + Polaroid.SIG_H / 2;
        const cy = baseCy + y;
        return Math.min(1234, Math.max(320, cy)) - baseCy;
    },

    /**
     * 把当前 hwTransform 应用到调整页的手写图层
     */
    applyHwTransformToLayer() {
        const layer = this.dom.adjustHwLayer;
        if (!layer) return;
        const t = this.state.hwTransform;
        layer.style.transform =
            `translate(${t.offsetX * this._hw.d}px, ${t.offsetY * this._hw.d}px) ` +
            `rotate(${t.rotation}deg) scale(${t.scale})`;
    },

    _syncHwSliders() {
        if (this.dom.adjustScale) this.dom.adjustScale.value = this.state.hwTransform.scale;
        if (this.dom.adjustRotate) this.dom.adjustRotate.value = this.state.hwTransform.rotation;
    },

    /**
     * 确认调整：把变换写回结果预览，返回结果页
     */
    applyHwTransform() {
        this.renderHandwritingToResult();
        this.switchView('result');
    },

    /**
     * 回到最初位置（重置变换）
     */
    resetHwTransform() {
        this.state.hwTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
        this._syncHwSliders();
        this.applyHwTransformToLayer();
    },

    /* ---------- 保存（含手写签名 + 标题/日期/宠物名 烘焙，移动端保存到相册） ---------- */
    async saveImage() {
        if (!this.state.processedCanvas) {
            this.toast('请先生成照片');
            return;
        }

        // 取纯净底图（photo + 胶片质感 + 相纸 PNG，不含日期/手写）
        if (!this.state.basePolaroid) {
            try {
                this.state.basePolaroid = await this.buildPurePolaroid();
            } catch (e) {
                this.debug('拍立得渲染失败', e.message);
                this.toast('照片生成失败，请重新尝试🐾');
                return;
            }
        }
        // 克隆底图用于导出，避免把手写写回共享的 basePolaroid（影响预览）
        const polaroidCanvas = document.createElement('canvas');
        polaroidCanvas.width = this.state.basePolaroid.width;
        polaroidCanvas.height = this.state.basePolaroid.height;
        polaroidCanvas.getContext('2d').drawImage(this.state.basePolaroid, 0, 0);
        this.debug('照片加载成功');
        this.debug('边框加载成功');

        // Layer 4：手写留言（独立快照图片，加载完成后再绘制，避免异步未就绪）
        if (this.state.signatureImage) {
            try {
                const img = await this.getSignatureImage();
                const ctx = polaroidCanvas.getContext('2d');
                const t = this.state.hwTransform;
                const sig = Polaroid.getSignatureRegion();
                const baseCx = sig.x + sig.w / 2;
                const baseCy = sig.y + sig.h / 2;
                const cx = baseCx + t.offsetX;
                const cy = baseCy + t.offsetY;
                const drawW = sig.w * t.scale;
                const drawH = sig.h * t.scale;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(t.rotation * Math.PI / 180);
                // 注意：此时相纸 PNG 已绘制在最顶层，手写绘制在 PNG 之上 = 落在白色签名区
                ctx.drawImage(
                    img,
                    0, 0, img.naturalWidth || Handwriting.BUFFER_W, img.naturalHeight || Handwriting.BUFFER_H,
                    -drawW / 2, -drawH / 2, drawW, drawH
                );
                ctx.restore();
                this.debug('手写合成完成');
            } catch (e) {
                // 手写合成失败：保留当前拍立得（不含手写），不让整页崩溃
                this.debug('手写合成失败', e.message);
                this.toast('手写保存失败，请重新尝试🐾');
            }
        } else {
            this.debug('无手写内容，直接导出拍立得');
        }

        // 把 宠物名 / 日期 / 用户标题 烘焙进拍立得白色留白区，
        // 使单张导出成为可直接分享/保存的“成片”（移动端无需再附文字）。
        try {
            this._bakeMemoryText(polaroidCanvas, Polaroid._cropOffsetX, Polaroid._cropOffsetY);
        } catch (e) {
            this.debug('文字烘焙失败（已忽略）', e.message);
        }

        const base = (this.state.petName || '').trim();
        const safe = base ? base.replace(/[\\/:*?"<>|]/g, '') : 'pawlaroid';
        const filename = `${safe}_Pawlaroid.png`;
        try {
            // 记录降采样版本，供展示墙“我的照片”复用（不修改导出本身）
            const max = 700;
            if (polaroidCanvas.width > max) {
                const r = max / polaroidCanvas.width;
                const small = document.createElement('canvas');
                small.width = max; small.height = Math.round(polaroidCanvas.height * r);
                small.getContext('2d').drawImage(polaroidCanvas, 0, 0, small.width, small.height);
                this.state.lastPolaroidDataURL = small.toDataURL('image/png');
            } else {
                this.state.lastPolaroidDataURL = polaroidCanvas.toDataURL('image/png');
            }

            // 移动端：保存到相册（Web Share / 长按兜底）；桌面：直接下载
            if (typeof MobileSave !== 'undefined') {
                await MobileSave.save(polaroidCanvas, filename);
            } else {
                Polaroid.download(polaroidCanvas, filename);
                this.toast('已保存到本地 🐾');
            }
        } catch (e) {
            this.debug('导出下载失败', e.message);
            this.toast('导出失败，请重新尝试🐾');
        }
    },

    /**
     * 把回忆文字（宠物名 / 日期 / 标题）绘制到拍立得底部白色留白区。
     * 坐标沿用 Polaroid 的 1254 基准坐标系，传入裁剪偏移以对齐最终画布。
     *
     * ⚠️ 手写签名区是 y 968~1198。若用户写过手写留言，那块白区已被占用，
     *    此时只在最底部窄条（1198~1254）落一行“🐾 名字 · 日期”，绝不覆盖手写。
     */
    _bakeMemoryText(canvas, offX, offY) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const petName = (this.state.petName || '').trim();
        const who = petName || 'TA';
        const dateStr = this.getDiaryDateText();
        const title = ((this.state.title || this.state.text || '').trim()) ||
            `为${who}拍下了一张照片 🐾`;
        const cx = (Polaroid.FRAME_WIDTH / 2) - (offX || 0);
        const hasHandwriting = !!this.state.signatureImage;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (hasHandwriting) {
            // 手写已占据签名区 → 只在签名区下方窄条补一行落款，避免遮挡
            const sigBottom = Polaroid.SIG_Y + Polaroid.SIG_H;    // 1198
            const y = ((sigBottom + Polaroid.FRAME_HEIGHT) / 2) - (offY || 0);
            const foot = dateStr ? `🐾 ${who} · ${dateStr}` : `🐾 ${who}`;
            ctx.font = `500 30px "PingFang SC","Microsoft YaHei",sans-serif`;
            ctx.fillStyle = '#9A7A5A';
            ctx.fillText(foot, cx, y);
            return;
        }

        // 无手写：整块白区居中排版 宠物名 → 日期 → 标题
        const lines = [];
        lines.push({ text: `🐾 ${who}`, size: 46, color: '#6D4A33', weight: 600 });
        if (dateStr) lines.push({ text: dateStr, size: 38, color: '#9A7A5A', weight: 400 });
        this._wrapCaption(title, 16).forEach(t =>
            lines.push({ text: t, size: 38, color: '#6D4A33', weight: 500 }));

        const photoBottom = Polaroid.PHOTO_Y + Polaroid.PHOTO_H; // 958
        const whiteBottom = Polaroid.FRAME_HEIGHT;               // 1254
        const gap = 56;
        const blockH = (lines.length - 1) * gap;
        const centerY = (photoBottom + whiteBottom) / 2 - 14;
        let y = (centerY - blockH / 2) - (offY || 0);

        lines.forEach(l => {
            ctx.font = `${l.weight} ${Math.round(l.size)}px "PingFang SC","Microsoft YaHei",sans-serif`;
            ctx.fillStyle = l.color;
            ctx.fillText(l.text, cx, y);
            y += gap;
        });
    },

    /* 把标题按最大字符数折行（中文按字符，英文按词），最多 2 行 */
    _wrapCaption(text, maxChars) {
        if (!text) return [''];
        if (text.length <= maxChars) return [text];
        const out = [];
        for (let i = 0; i < text.length && out.length < 2; i += maxChars) {
            out.push(text.slice(i, i + maxChars));
        }
        if (text.length > maxChars * 2 && out.length === 2) {
            out[1] = out[1].slice(0, maxChars - 1) + '…';
        }
        return out;
    },

    /** 把 canvas 降采样为 dataURL（控制 localStorage 体积） */
    _downsample(canvas, max) {
        if (!canvas) return '';
        // 目标尺寸（按比例缩放，控制 localStorage 体积）
        let w = canvas.width, h = canvas.height;
        if (w > max) { const r = max / w; w = max; h = Math.round(h * r); }
        // 先铺白底再绘制：拍立得本就是不透明白边，JPEG 比 PNG 小 5~10 倍，
        // 白底可避免透明区域在 JPEG 下变黑。存储用 JPEG，展示足够清晰。
        const out = document.createElement('canvas');
        out.width = w; out.height = h;
        const octx = out.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, w, h);
        octx.drawImage(canvas, 0, 0, w, h);
        try { return out.toDataURL('image/jpeg', 0.85); }
        catch (e) { return out.toDataURL('image/png'); }
    },

    /** 结果页“展示墙”按钮：携带当前拍立得直接进入展示墙，可继续 DIY 布置 */
    async sendToWall() {
        const canvas = await this.buildFinalPolaroid();
        if (!canvas) { this.toast('请先生成照片'); return; }
        const url = this._downsample(canvas, this.STORE_MAX);
        this.state.lastPolaroidDataURL = url;
        // 同时记一条回忆（标记已上墙），让时光机与展示墙数据互通
        this._recordMemory(url, true);
        if (typeof Wall !== 'undefined') {
            Wall.addPolaroid(this.state.currentMemoryId, url);
            this.goWall();
        }
    },

    /** 结果页“时光机”按钮：自动保存这条回忆记录，并直接进入时光机浏览 */
    async sendToTimemachine() {
        const canvas = await this.buildFinalPolaroid();
        if (!canvas) { this.toast('请先生成照片'); return; }
        const url = this._downsample(canvas, this.STORE_MAX);
        this.state.lastPolaroidDataURL = url;
        // 自动保存该回忆记录（日期 / 宠物名字 / 拍立得照片）
        this._recordMemory(url, false);
        this.goTimemachine();
    },

    /**
     * 组装“最终拍立得”画布（纯净底图 + 手写留言），不修改任何既有导出逻辑。
     * 供展示墙上墙 / “我的照片”复用。返回 Promise<canvas>。
     */
    async buildFinalPolaroid() {
        if (!this.state.processedCanvas) return null;
        if (!this.state.basePolaroid) {
            this.state.basePolaroid = await this.buildPurePolaroid();
        }
        const out = document.createElement('canvas');
        out.width = this.state.basePolaroid.width;
        out.height = this.state.basePolaroid.height;
        const ctx = out.getContext('2d');
        ctx.drawImage(this.state.basePolaroid, 0, 0);

        if (this.state.signatureImage) {
            try {
                const img = await this.getSignatureImage();
                const t = this.state.hwTransform;
                const sig = Polaroid.getSignatureRegion();
                const baseCx = sig.x + sig.w / 2;
                const baseCy = sig.y + sig.h / 2;
                const cx = baseCx + t.offsetX;
                const cy = baseCy + t.offsetY;
                const drawW = sig.w * t.scale;
                const drawH = sig.h * t.scale;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(t.rotation * Math.PI / 180);
                ctx.drawImage(
                    img,
                    0, 0, img.naturalWidth || Handwriting.BUFFER_W, img.naturalHeight || Handwriting.BUFFER_H,
                    -drawW / 2, -drawH / 2, drawW, drawH
                );
                ctx.restore();
            } catch (e) { /* 保留无手写版本 */ }
        }
        return out;
    },

    /** 把当前生成的拍立得贴到展示墙（入口按钮调用） */
    async addToWall() {
        const canvas = await this.buildFinalPolaroid();
        if (!canvas) { this.toast('请先生成照片'); return; }
        // 降采样以控制 localStorage 体积
        let url = canvas.toDataURL('image/png');
        const max = this.STORE_MAX;
        if (canvas.width > max) {
            const r = max / canvas.width;
            const small = document.createElement('canvas');
            small.width = max; small.height = Math.round(canvas.height * r);
            small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
            url = small.toDataURL('image/png');
        }
        this.state.lastPolaroidDataURL = url;
        // 增量记录到时光机（贴墙即保留这一刻，并标记已上墙）
        this._recordMemory(url, true);
        if (typeof Wall !== 'undefined') {
            Wall.addPolaroid(this.state.currentMemoryId, url);
            this.goWall();
        }
    },

    /** 进入展示墙视图 */
    goWall() {
        if (!this.dom.views.wall) { this.toast('展示墙尚未就绪'); return; }
        this.switchView('wall');
        if (typeof Wall !== 'undefined') Wall.init();
    },

    /** 进入时光机视图（浏览回忆，独立页面，不修改拍照流程） */
    goTimemachine() {
        if (!this.dom.views.timemachine) { this.toast('时光机尚未就绪'); return; }
        this.switchView('timemachine');
        if (typeof TimeMachine !== 'undefined') TimeMachine.init();
    },

    /**
     * 记录一条回忆到时光机（纯增量，不改动任何既有导出/上墙逻辑）。
     * 在 saveImage（保存）与 addToWall（贴墙）两处调用，二者共用同一张
     * image（最终拍立得），数据层按唯一 id 累积合并，故“保存后再贴墙”只会有一条例证。
     * @param {string} polaroidURL 最终拍立得（含相纸边框 + 手写）dataURL
     * @param {boolean} onWall 是否同时贴到了展示墙
     */
    _recordMemory(polaroidURL, onWall) {
        try {
            if (typeof PawMemory === 'undefined' || !polaroidURL) return;
            // 原图降采样，供详情页“查看原图”（控制 localStorage 体积）
            let original = '';
            const oc = this.state.processedCanvas;
            if (oc) {
                const max = 500;
                let w = oc.width, h = oc.height;
                if (w > max) { const r = max / w; w = max; h = Math.round(h * r); }
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const cctx = c.getContext('2d');
                cctx.fillStyle = '#ffffff';
                cctx.fillRect(0, 0, w, h);
                cctx.drawImage(oc, 0, 0, w, h);
                try { original = c.toDataURL('image/jpeg', 0.85); }
                catch (e) { original = c.toDataURL('image/png'); }
            }
            const rec = {
                id: this.state.currentMemoryId,   // 按唯一 id 累积，避免不同照片互相覆盖
                image: polaroidURL,
                originalImage: original,
                date: this.getRecordISODate(),
                createdAt: Date.now(),
                frame: this.state.selectedPaper,
                // 拍立得标题：可编辑；空值兜底为“日常陪伴”。text 镜像 title，
                // 以兼容时光机卡片 / 详情 / 宠物日记导出等既有读 rec.text 的消费方。
                title: (this.state.title && this.state.title.trim()) || '日常陪伴',
                text: (this.state.title && this.state.title.trim()) || '日常陪伴',
                petName: this.state.petName || '',
                note: (this.state.note ? [this.state.note.trim()] : []),
                tags: Array.isArray(this.state.tags) ? this.state.tags.slice() : [],
                onWall: !!onWall
            };
            PawMemory.add(rec);
            // 自修复：若写入后立刻读不到（localStorage 配额已满），先压缩旧大图释放配额，
            // 再重试一次，确保新照片在时光机里不丢（展示墙能写、时光机读不到的不对称根因）。
            if (typeof PawMemory.get === 'function' && !PawMemory.get(rec.id)) {
                this._compressLegacyMemories().then(() => PawMemory.add(rec));
            }
        } catch (e) {
            console.warn('[recordMemory] 记录回忆失败（不影响保存）', e);
        }
    },

    /** 取回忆记录的排序日期（优先用所选自定义日期，否则今天） */
    getRecordISODate() {
        const pd = this.state.photoDate;
        if (pd && pd.mode === 'custom' && pd.custom) {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pd.custom);
            if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00`;
        }
        return new Date().toISOString();
    },

    toast(message) {
        this.dom.toast.innerHTML = message;
        this.dom.toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.dom.toast.classList.remove('show');
        }, 2500);
    },

    /* ---------- 时光机删除回忆 ---------- */
    deleteMemory(id) {
        if (!id) return;
        if (!confirm('确定要删除这张拍立得回忆吗？\n该操作不可恢复。')) return;

        try {
            // 1. 从统一记忆库移除
            if (typeof PawMemory !== 'undefined') PawMemory.remove(id);

            // 2. 从展示墙移除关联条目
            if (typeof Wall !== 'undefined') {
                Wall._load();
                Wall.data = Wall.data.filter(it => !(it.memoryId === id));
                Wall._save();
                Wall._render();
            }

            // 3. 如果正好删了当前最新一张，刷新首页缩略图
            this.renderHomeRecent();

            // 4. 重新渲染时光机（不依赖 currentView 判断，确保 DOM 更新）
            if (typeof TimeMachine !== 'undefined') {
                try { TimeMachine.render(); } catch (_) {}
            }

            this.toast('回忆已删除 🐾');
        } catch (e) {
            this.toast('删除失败，请重试');
        }
    },

    /* ---------- 设置弹窗 + 数据备份/恢复（解决 http:// 与 file:// 跨源数据不通） ---------- */
    openSettings() {
        const mask = document.getElementById('settingsModal');
        if (mask) mask.classList.add('open');
        this._refreshBackupCount();
    },
    closeSettings() {
        const mask = document.getElementById('settingsModal');
        if (mask) mask.classList.remove('open');
    },
    _refreshBackupCount() {
        const el = document.getElementById('settingsCount');
        if (!el) return;
        let mem = 0, wall = 0;
        try {
            const m = JSON.parse(localStorage.getItem('pawlaroid_memories') || '[]');
            const w = JSON.parse(localStorage.getItem('pawlaroid_wall') || '[]');
            mem = Array.isArray(m) ? m.length : 0;
            wall = Array.isArray(w) ? w.length : 0;
        } catch (e) {}
        el.textContent = `当前版本 ${this.VERSION} · 仓库：回忆 ${mem} 条 · 展示墙 ${wall} 个`;
    },

    /** 复制当前版本号到剪贴板（带 file:// 降级方案） */
    async copyVersion() {
        const ver = this.VERSION || '';
        if (!ver) return;
        let ok = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(ver);
                ok = true;
            }
        } catch (e) { /* 走降级 */ }
        if (!ok) {
            // file:// 等不支持 Clipboard API 时，用临时 textarea + execCommand 兜底
            try {
                const ta = document.createElement('textarea');
                ta.value = ver;
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                ok = document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (e) { ok = false; }
        }
        this.toast(ok ? `已复制版本号：${ver}` : `复制失败，版本号是：${ver}`);
    },

    /** 打开用户反馈问卷（腾讯问卷）。集中读取 App.FEEDBACK_URL，新窗口打开、不离开当前页面、移动端自动新标签。 */
    openFeedback() {
        const url = this.FEEDBACK_URL;
        if (!url) { this.toast('反馈入口暂未配置'); return; }
        try {
            // _blank + noopener 保证不影响当前页面；移动端浏览器会把 _blank 当作新标签切换
            const w = window.open(url, '_blank', 'noopener,noreferrer');
            if (!w) this.toast('已为你准备好反馈页，若被拦截请允许弹出窗口');
        } catch (e) {
            this.toast('打开反馈页失败：' + (e && e.message));
        }
    },

    /** 清空全部本地数据并重置（排障用：排除旧脏数据 / 跨源残留导致的不显示） */
    resetLocalData() {
        try {
            ['pawlaroid_memories', 'pawlaroid_wall', 'pawlaroid_pet'].forEach(k => localStorage.removeItem(k));
            this.toast('已清空本地数据，正在重启…');
            setTimeout(() => location.reload(), 600);
        } catch (e) {
            this.toast('清空失败：' + (e && e.message));
        }
    },
    /** 把全部应用数据导出为一个 JSON 文件（跨源/换设备迁移用） */
    exportBackup() {
        try {
            const keys = ['pawlaroid_memories', 'pawlaroid_wall', 'pawlaroid_pet'];
            const data = { _app: 'Pawlaroid', _version: 1, _exportedAt: new Date().toISOString(), store: {} };
            keys.forEach(k => { data.store[k] = localStorage.getItem(k); });
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const d = new Date();
            const pad = n => String(n).padStart(2, '0');
            a.download = `pawlaroid-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.toast('已导出备份 💾');
        } catch (e) {
            console.warn('[exportBackup]', e);
            this.toast('导出失败，请重试');
        }
    },
    _triggerImport() {
        const input = document.getElementById('backupFileInput');
        if (input) input.click();
    },
    /** 从备份文件读回全部数据并写入当前源（localStorage） */
    importBackup(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                const store = (data && data.store) ? data.store : data;
                let count = 0, quotaHit = false;
                // 1) 先写记忆与宠物信息（展示墙会引用记忆里的图）
                ['pawlaroid_memories', 'pawlaroid_pet'].forEach(k => {
                    if (store[k] == null) return;
                    try {
                        localStorage.setItem(k, store[k]);
                        count++;
                    } catch (e) {
                        quotaHit = true;
                        console.warn('[importBackup] 写入', k, '超出本地存储上限', e);
                    }
                });
                // 2) 写展示墙：把“能对应到已导入记忆”的拍立得，在写入前就去掉自带 src 副本
                //    （改为渲染时按 memoryId 取图），这样即便备份很大，墙也能成功导入而不触发配额失败。
                if (store['pawlaroid_wall'] != null) {
                    try {
                        const wallArr = JSON.parse(store['pawlaroid_wall']);
                        const memIds = new Set(JSON.parse(localStorage.getItem('pawlaroid_memories') || '[]').map(m => m.id));
                        const slim = Array.isArray(wallArr) ? wallArr.map(it => {
                            if (it && it.type === 'polaroid' && it.memoryId && memIds.has(it.memoryId)) {
                                const c = Object.assign({}, it);
                                delete c.src;
                                return c;
                            }
                            return it;
                        }) : wallArr;
                        localStorage.setItem('pawlaroid_wall', JSON.stringify(slim));
                        count++;
                    } catch (e) {
                        quotaHit = true;
                        console.warn('[importBackup] 写入 pawlaroid_wall 超出本地存储上限', e);
                    }
                }
                if (count === 0) { this.toast('备份文件里没有可导入的数据'); return; }
                // 刷新内存中的数据（Wall 有缓存数组，需要重新 _load）
                if (typeof Wall !== 'undefined' && typeof Wall._load === 'function') Wall._load();
                // 兜底回收：处理记忆里没有对应记录的墙拍立得（理论上上面已处理）
                this._reclaimWallStorage();
                // 懒压缩导入的旧 PNG 大图 → 小 JPEG，释放配额（避免新照片写不进时光机）
                this._compressLegacyMemories();
                this.renderHomeRecent();
                if (this.state.currentView === 'timemachine' && typeof App.goTimemachine === 'function') App.goTimemachine();
                if (this.state.currentView === 'wall' && typeof App.goWall === 'function') App.goWall();
                this._refreshBackupCount();
                if (quotaHit) {
                    this.toast('已导入部分数据：本地存储已满，旧的大图可能未全部导入。建议先删除部分旧照片。');
                } else {
                    this.toast(`已导入 ${count} 项数据 📥`);
                }
            } catch (e) {
                console.warn('[importBackup]', e);
                this.toast('导入失败：文件格式不正确');
            }
        };
        reader.readAsText(file);
    },

    /** 存储回收：展示墙的拍立得若已有对应记忆(id 匹配)，则删除墙里自带的那份 src
        副本，改为渲染时按 memoryId 从记忆取图——避免同一张照片被存两份占满配额。 */
    _reclaimWallStorage() {
        try {
            if (typeof Wall === 'undefined') return;
            Wall._load();
            let changed = false;
            Wall.data = Wall.data.map(it => {
                if (it.type === 'polaroid' && it.memoryId && it.src &&
                    typeof PawMemory !== 'undefined' && PawMemory.get(it.memoryId)) {
                    const cp = Object.assign({}, it);
                    delete cp.src;
                    changed = true;
                    return cp;
                }
                return it;
            });
            if (changed) Wall._save();
        } catch (e) { /* 回收失败不影响使用 */ }
    },

    /** 把一张 dataURL 重新编码为更小体积的 JPEG（旧 PNG 大图瘦身用），失败返回原值。
        @param {string} dataURL 原图（base64）
        @param {number} max 最长边像素上限 */
    _reencodeToJpeg(dataURL, max) {
        return new Promise((resolve) => {
            if (!dataURL || typeof dataURL !== 'string') return resolve(dataURL);
            if (dataURL.indexOf('data:image/jpeg') === 0) return resolve(dataURL); // 已是 JPEG，跳过
            const img = new Image();
            img.onload = () => {
                try {
                    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                    if (!w || !h) return resolve(dataURL);
                    if (w > max) { const r = max / w; w = max; h = Math.round(h * r); }
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(c.toDataURL('image/jpeg', 0.85));
                } catch (e) { resolve(dataURL); }
            };
            img.onerror = () => resolve(dataURL);
            img.src = dataURL;
        });
    },

    /** 懒压缩：把已存储的“旧 PNG 大图”回忆重新编码为小 JPEG，释放 localStorage 配额。
        幂等——已是 JPEG 的图会跳过，不会重复压缩。解决“导入旧数据后配额被占满、
        新生成的照片写不进时光机（PawMemory）”的根因。 */
    async _compressLegacyMemories() {
        try {
            if (typeof PawMemory === 'undefined') return;
            const arr = PawMemory._read();
            let changed = false;
            for (let i = 0; i < arr.length; i++) {
                const r = arr[i];
                if (r && r.image && r.image.indexOf('data:image/png') === 0) {
                    const jpg = await this._reencodeToJpeg(r.image, 560);
                    if (jpg && jpg !== r.image) { r.image = jpg; changed = true; }
                }
                if (r && r.originalImage && r.originalImage.indexOf('data:image/png') === 0) {
                    const jpg = await this._reencodeToJpeg(r.originalImage, 500);
                    if (jpg && jpg !== r.originalImage) { r.originalImage = jpg; changed = true; }
                }
            }
            if (changed) {
                PawMemory._write(arr);
                this._refreshBackupCount();
            }
        } catch (e) { /* 压缩失败不影响使用 */ }
    },

    /** 裁剪已存储旧拍立得的白边（之前的相框 PNG 透明边距导致四周有暖白冗余）。
        幂等——已裁剪（非正方形）的图跳过，仅处理宽高比≈1:1 的旧图。 */
    async _cropLegacyPolaroids() {
        try {
            if (typeof PawMemory === 'undefined') return;
            const arr = PawMemory._read();
            let changed = false;
            for (let i = 0; i < arr.length; i++) {
                const r = arr[i];
                if (!r || !r.image) continue;
                const cropped = await this.__cropPolaroidImage(r.image);
                if (cropped && cropped !== r.image) { r.image = cropped; changed = true; }
            }
            if (changed) {
                PawMemory._write(arr);
                // 刷新展示墙：① 清除有 memoryId 项的 src 缓存（强制走 PawMemory 查图）
                //             ② 无 memoryId 但有 src 的老数据直接裁剪 src 本身
                if (typeof Wall !== 'undefined') {
                    try {
                        Wall._load();
                        let wallChanged = false;
                        const newWall = [];
                        for (const it of Wall.data) {
                            if (it.type === 'polaroid') {
                                const cp = Object.assign({}, it);
                                if (it.memoryId && it.src) {
                                    // 有记忆关联 → 删掉缓存 src，渲染时从 PawMemory 取
                                    delete cp.src;
                                    wallChanged = true;
                                } else if (!it.memoryId && it.src) {
                                    // 无记忆关联的老数据 → 裁剪 src 本身
                                    const cropped = await this.__cropPolaroidImage(it.src);
                                    if (cropped && cropped !== it.src) {
                                        cp.src = cropped;
                                        wallChanged = true;
                                    }
                                }
                                newWall.push(cp);
                            } else {
                                newWall.push(it);
                            }
                        }
                        if (wallChanged) { Wall.data = newWall; Wall._save(); }
                        Wall._render();
                    } catch (_) {}
                }
                this._refreshBackupCount();
                // 首页"最近一张"缩略图也刷新
                this.renderHomeRecent();
            }
        } catch (e) { /* 裁剪失败不影响使用 */ }
    },

    /** 裁剪单张拍立得 dataURL 的白边（异步加载图像→裁剪→返回新 dataURL）。
        幂等：若图像宽高差>5% 说明已裁剪，直接返回原值。 */
    __cropPolaroidImage(dataURL) {
        return new Promise((resolve) => {
            if (!dataURL || typeof dataURL !== 'string') return resolve(dataURL);
            const img = new Image();
            img.onload = () => {
                try {
                    const w = img.naturalWidth || img.width;
                    const h = img.naturalHeight || img.height;
                    if (!w || !h) return resolve(dataURL);
                    // 已非正方形→跳过（宽高差>5% 说明已裁剪）
                    if (Math.abs(w - h) / Math.max(w, h) > 0.05) return resolve(dataURL);
                    // 按已知透明边距比例裁剪（相框 600px 原图在 1254 画布上的边距映射）
                    const marginL = Math.round(w * (54 / 600));
                    const marginR = Math.round(w * (54 / 600));
                    const marginT = Math.round(h * (17 / 600));
                    const marginB = Math.round(h * (25 / 600));
                    const newW = w - marginL - marginR;
                    const newH = h - marginT - marginB;
                    if (newW <= 10 || newH <= 10) return resolve(dataURL);
                    const c = document.createElement('canvas');
                    c.width = newW; c.height = newH;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(img, marginL, marginT, newW, newH, 0, 0, newW, newH);
                    resolve(c.toDataURL('image/jpeg', 0.85));
                } catch (e) { resolve(dataURL); }
            };
            img.onerror = () => resolve(dataURL);
            img.src = dataURL;
        });
    },
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
    // 初始即首页：同步底部导航显隐（_syncNav 仅在 switchView 时触发，需补一次初始态）
    if (typeof App._syncNav === 'function') App._syncNav(App.state.currentView || 'home');
    // 首页“最近一张”回忆预览（统一记忆库）
    if (typeof App.renderHomeRecent === 'function') App.renderHomeRecent();
    // 测试用 hash 自动跳转：#upload / #crop / #recipe / #develop / #result
    const hash = location.hash.replace('#', '');
    if (hash && ['upload', 'crop', 'recipe', 'develop', 'result', 'memory', 'handwrite', 'adjust'].includes(hash)) {
        // 准备测试数据
        if (hash !== 'home') {
            const c = document.createElement('canvas');
            c.width = 800; c.height = 800;
            const ctx = c.getContext('2d');
            const grad = ctx.createLinearGradient(0,0,800,800);
            grad.addColorStop(0,'#FFE0B0'); grad.addColorStop(1,'#FFC97A');
            ctx.fillStyle = grad; ctx.fillRect(0,0,800,800);
            ctx.fillStyle = '#6D4A33';
            ctx.beginPath(); ctx.ellipse(400,500,220,180,0,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(400,380,130,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(310,280); ctx.lineTo(280,200); ctx.lineTo(360,250); ctx.fill();
            ctx.beginPath(); ctx.moveTo(490,280); ctx.lineTo(520,200); ctx.lineTo(440,250); ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.beginPath(); ctx.arc(370,370,14,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(430,370,14,0,Math.PI*2); ctx.fill();
            App.state.imageElement = c;
            App.state.croppedImage = c;
            App.state.processedCanvas = FilmRecipes.process(c, 'pawClassic', 800);
        }
        setTimeout(() => {
            if (hash === 'upload') App.switchView('upload');
            else if (hash === 'crop') {
                App.switchView('crop');
                setTimeout(() => Cropper.init(App.state.imageElement), 50);
            }
            else if (hash === 'recipe') {
                App.switchView('recipe');
                App.renderRecipePreview();
            }
            else if (hash === 'develop') {
                App.switchView('develop');
                App.updatePaperFrame(document.getElementById('developFrameBg'));
                Developing.init(App.state.processedCanvas, document.getElementById('developCanvas'), ()=>{}, ()=>{});
                Developing.start();
            }
            else if (hash === 'result') {
                App.switchView('result');
                App.renderResult();
            }
            else if (hash === 'memory') {
                App.switchView('memory');
                App.renderMemory();
            }
            else if (hash === 'handwrite') {
                App.switchView('result');
                App.renderResult();
                App.openHandwrite();
            }
            else if (hash === 'adjust') {
                App.switchView('result');
                App.renderResult();
                if (!App.state.signatureImage) {
                    // 测试用：模拟一句手写留言，便于预览调整模式
                    if (!Handwriting._setup) Handwriting.setup(document.getElementById('handwriteBigCanvas'));
                    const c = Handwriting.bufferCtx;
                    c.save();
                    c.strokeStyle = '#3D2817';
                    c.lineWidth = 24; c.lineCap = 'round'; c.lineJoin = 'round';
                    c.beginPath(); c.moveTo(360, 300);
                    c.bezierCurveTo(560, 200, 760, 420, 980, 300); c.lineTo(1180, 300);
                    c.stroke();
                    c.beginPath(); c.moveTo(360, 520);
                    c.bezierCurveTo(620, 460, 900, 560, 1240, 500);
                    c.stroke();
                    c.restore();
                    App.state.handwritingCanvas = Handwriting.getBuffer();
                    App.state.signatureImage = Handwriting.getBuffer().toDataURL('image/png');
                    App.renderHandwritingToResult();
                }
                App.goAdjust();
            }
        }, 100);
    }
});