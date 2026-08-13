/* ========================================
   paperStyles.js - 相纸样式（动态加载）
   边框资源不再写死在代码中，页面加载时自动生成列表。

   两种环境兼容：
   - http(s)（如 localhost:8090）：fetch frames/frames.json（始终最新）
   - file:// 直接打开：fetch 被 CORS 拦截，改用 <script> 注入的
     window.PAW_FRAMES（见 frames/frames.js）

   新增边框：把 WebP 放进 frames/，
   在 frames.json 与 frames.js 各加一行，刷新网页即可出现。
   配置不写死在代码里，无硬编码相纸名。

   frames.json / frames.js 格式：
   [
     { "name": "经典白边", "thumbnail": "xxx.webp", "image": "xxx.webp" }
   ]
   ======================================== */

const PaperStyles = {

    /* 边框所在目录（站点根目录下的相对路径） */
    FRAME_DIR: 'frames/',

    /* frames.json 地址：仓库内同源清单（始终全量，打开即玩） */
    JSON_URL: 'frames/frames.json',

    /* 动态加载后的相纸列表 */
    frames: [],

    /* 是否已加载完成 */
    loaded: false,

    /* 加载是否失败（失败则回退兜底） */
    loadError: false,

    /* 兜底默认：fetch 与 window 注入都失败时才用，保证页面不崩 */
    fallback: [
        {
            id: 'classic_white',
            name: '经典白边',
            file: 'frames/classic_white.webp',
            thumbnail: 'frames/classic_white.webp'
        }
    ],

    /**
     * 页面加载时调用：动态生成相纸列表。
     * 兼容两种运行环境：
     *   1) http(s)（如 localhost:8090）：优先 fetch frames.json，始终最新；
     *   2) file:// 直接打开：fetch 本地 JSON 会被浏览器 CORS 拦截，
     *      改用 <script> 注入的 window.PAW_FRAMES（见 frames/frames.js）。
     * 两者皆失败时，才回退到内置 classic_white 兜底，保证页面不崩。
     * @returns {Promise<void>}
     */
    async load() {
        if (this.loaded) return;
        let loaded = false;

        // 1) http(s)：fetch frames.json（始终最新，改 JSON 即生效）
        try {
            const res = await fetch(this.JSON_URL, { cache: 'no-store' });
            if (res.ok) {
                const raw = await res.json();
                const list = Array.isArray(raw) ? raw : [];
                if (list.length) {
                    this.frames = list.map((f, i) => this.normalize(f, i));
                    loaded = true;
                }
            }
        } catch (e) {
            // file:// 下 fetch 被浏览器拦截，走下方 window.PAW_FRAMES 兜底
            console.warn('[PaperStyles] fetch frames.json 失败（可能为 file:// 环境），尝试 window.PAW_FRAMES：', e);
        }

        // 2) file://：读取 <script> 注入的 window.PAW_FRAMES（绕过 CORS）
        if (!loaded && typeof window.PAW_FRAMES !== 'undefined' && Array.isArray(window.PAW_FRAMES) && window.PAW_FRAMES.length) {
            this.frames = window.PAW_FRAMES.map((f, i) => this.normalize(f, i));
            loaded = true;
        }

        // 3) 兜底：仅经典白边（同样经 resolve 拼前缀，避免 404）
        if (!loaded || this.frames.length === 0) {
            this.loadError = !loaded;
            this.frames = this.fallback.map((f, i) => this.normalize(f, i));
        }

        this.loaded = true;
    },

    /**
     * 把 frames.json 中的 {name, thumbnail, image}
     * 规范化为内部统一对象 {id, name, file, thumbnail}
     * @param {Object} f 原始条目
     * @param {number} index 在数组中的位置
     */
    normalize(f, index) {
        const name = (f && f.name) ? f.name : ('边框 ' + (index + 1));
        const imageFile = (f && (f.image || f.file)) || '';
        const thumbFile = (f && f.thumbnail) || imageFile;

        // 路径相对化（frames/xxx.webp），由 assetConfig.resolve() 拼前缀（assets/）
        const ac = (typeof window !== 'undefined' && window.ASSET_CONFIG) ? window.ASSET_CONFIG : null;
        const file = ac ? ac.resolve(imageFile) : (imageFile.includes('/') ? imageFile : this.FRAME_DIR + imageFile);
        const thumbnail = ac ? ac.resolve(thumbFile) : (thumbFile.includes('/') ? thumbFile : this.FRAME_DIR + thumbFile);

        // 内联 data URI（base64）：file:// 下用 file 路径绘制会污染画布，
        // 导致导出 toDataURL() 抛 SecurityError；data: URI 不跨域，永不污染。
        // 存在时优先作为绘制来源（file:// 与 http 下都安全）。
        const dataUri = (f && f.dataUri) ? f.dataUri : '';

        // id 用图片文件名（去扩展名），保证稳定且唯一
        const id = this.idFromFilename(imageFile) || ('frame-' + index);

        return { id, name, file, thumbnail, dataUri };
    },

    /** 从图片路径提取文件名（去扩展名）作为 id */
    idFromFilename(imageFile) {
        if (!imageFile) return '';
        const base = imageFile.split('/').pop();
        return base.replace(/\.[^.]+$/, '');
    },

    /** 获取全部相纸（已按 frames.json 顺序排列） */
    getAll() {
        return this.frames;
    },

    /** 根据 id 查找相纸配置 */
    findById(id) {
        return this.frames.find(p => p.id === id) || null;
    },

    /* 默认相纸：列表第一项（经典白色应放第一位） */
    getDefaultId() {
        if (this.frames.length) return this.frames[0].id;
        return this.fallback.length ? this.fallback[0].id : null;
    },

    /* 渲染相纸缩略图到列表 DOM */
    renderListItem(paper) {
        const item = document.createElement('div');
        item.className = 'paper-item';
        item.dataset.paperId = paper.id;
        const thumb = paper.thumbnail || paper.file;
        item.innerHTML = `
            <img class="paper-thumb" src="${thumb}" alt="${paper.name}" draggable="false" loading="lazy"/>
            <div class="paper-name">${paper.name}</div>
            <div class="paper-check">✓</div>
        `;
        return item;
    }
};
