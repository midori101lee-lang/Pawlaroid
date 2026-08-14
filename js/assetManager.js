/* ============================================================
   assetManager.js — 素材管理中枢（资源管理层，不碰业务逻辑）
   ------------------------------------------------------------
   统一职责：
     1) 双源加载：http(s) 优先 fetch assets/config/<name>.json（改 JSON 即生效）；
        file:// 下 fetch 被 CORS 拦截，回退 <script> 注入的 window.PAW_*。
     2) 归一化：把各配置的原始字段规范成内部统一对象。
     3) resolve()：相对站点根的路径拼统一前缀 'assets/'。
     4) 按类别取数：get('frames'|'stickers'|'pins'|'themes')、
        getDecor(themeId)（固定件按 wallTheme 过滤）、
        getStickerSrc(id)、logical(key)（homeHero/wallBg/...）。

   这是「配置驱动 + 提交系统」的地基：新增素材 = 往对应 JSON 加一条，
   无需改任何 JS 业务代码。各消费方（paperStyles/wall/exporter...）
   只调用这里的 get* 接口。
   ============================================================ */
(function () {
    var BASE = 'assets/';

    /* 逻辑资产键（代码统一走这里，避免散落硬编码；值可经提交系统扩展） */
    var LOGICAL = {
        homeHero: 'home/hero.webp',
        boneCta:  'home/bone-cta.webp',
        wallBg:   'backgrounds/wall-bg.webp',
        tmTitle:  'titles/time-machine-title.webp'
    };

    /* 各配置类别的加载元数据 */
    var MAP = {
        frames:  { json: 'assets/config/frames.json',  global: 'PAW_FRAMES',      fb: [{ name: '经典白边', image: 'frames/classic_white.webp', thumbnail: 'frames/classic_white.webp' }] },
        stickers:{ json: 'assets/config/stickers.json', global: 'PAW_STICKERS',   fb: [] },
        pins:    { json: 'assets/config/pins.json',     global: 'PAW_PINS',       fb: [] },
        themes:  { json: 'assets/config/themes.json',   global: 'PAW_WALL_THEMES', fb: [] }
    };

    function resolve(p) { return BASE + p; }

    function idFromFilename(imageFile) {
        if (!imageFile) return '';
        var base = imageFile.split('/').pop();
        return base.replace(/\.[^.]+$/, '');
    }

    /* 归一化：兼容历史字段名（image/file/thumbnail） */
    function normalizeFrame(f, i) {
        var img = (f && (f.image || f.file)) || '';
        var ac = window.ASSET_CONFIG;
        var file = ac ? ac.resolve(img) : (img.indexOf('/') >= 0 ? img : 'frames/' + img);
        var thumbFile = (f && f.thumbnail) || img;
        var thumb = ac ? ac.resolve(thumbFile) : (thumbFile.indexOf('/') >= 0 ? thumbFile : 'frames/' + thumbFile);
        return {
            id: idFromFilename(img) || ('frame-' + i),
            name: (f && f.name) || ('边框 ' + (i + 1)),
            image: img, file: file, thumbnail: thumb,
            dataUri: (f && f.dataUri) || ''
        };
    }

    function normalizeSticker(s) { return s; }   // stickers.json 字段已与内部一致

    function normalizePin(p) {
        var item = Object.assign({}, p);
        item.defaultSize = p.size != null ? p.size : (p.defaultSize || 56);
        // file 由 AttachmentFactory 按参数生成（http/json 路径在这里补；.js 兜底已在注入时生成）
        if (!item.file && window.AttachmentFactory) item.file = window.AttachmentFactory.create(p);
        return item;
    }

    function normalizeTheme(t) { return t; }      // themes.json 字段已与内部一致

    var NORMALIZERS = { frames: normalizeFrame, stickers: normalizeSticker, pins: normalizePin, themes: normalizeTheme };

    var AssetManager = {
        BASE: BASE,
        resolve: resolve,
        logical: function (key) { return resolve(LOGICAL[key] || (key.indexOf('/') >= 0 ? key : '')); },
        _cache: {},

        async load(name) {
            if (this._cache[name]) return this._cache[name];
            var m = MAP[name];
            if (!m) return [];
            var list = [];
            var ok = false;
            try {
                var res = await fetch(m.json, { cache: 'no-store' });
                if (res.ok) {
                    var raw = await res.json();
                    if (Array.isArray(raw) && raw.length) { list = raw; ok = true; }
                }
            } catch (e) { /* file:// → 走 window 兜底 */ }

            if (!ok && window[m.global] && Array.isArray(window[m.global]) && window[m.global].length) {
                list = window[m.global];
                ok = true;
            }
            if (!ok) list = (m.fb || []).slice();

            var norm = (NORMALIZERS[name] || function (x) { return x; });
            this._cache[name] = list.map(function (it, i) { return norm(it, i); });
            return this._cache[name];
        },

        get(name) { return this._cache[name] || []; },

        /* 固定件：按当前主题过滤（pin.wallTheme 包含主题 id 即出现） */
        getDecor(themeId) {
            return this.get('pins').filter(function (p) {
                return (p.wallTheme || []).indexOf(themeId) >= 0;
            });
        },

        /* 贴纸绘制源（导出用），返回 assets/ 前缀路径 */
        getStickerSrc(id) {
            var s = this.get('stickers').filter(function (x) { return x.id === id; })[0];
            if (!s) return '';
            return this.resolve(s.image);
        }
    };

    window.AssetManager = AssetManager;
})();
