/* ============================================================
   memory-store.js — 时光机数据层（独立，不修改既有拍立得流程）
   ------------------------------------------------------------
   复用“每一次被保留的拍立得”作为一条回忆：
     - 在 App.saveImage（保存/下载）与 App.addToWall（贴到展示墙）时，
       由 app.js 以纯增量方式写入，不改动任何既有逻辑。

   每条回忆结构（统一数据模型，供 时光机 / 展示墙 / 首页 共享）：
     {
       id,                 // 唯一 id（每次生成分配，按 id 累积，互不覆盖）
       image,              // 最终拍立得（含相纸边框 + 手写）dataURL，时间轴/墙展示
       originalImage,      // 原图（降采样 dataURL），详情页“查看原图”
       frame,              // 相纸样式 id（selectedPaper）
       text,               // 生成时填写的文字（场景标签 / 留言）
       date,               // ISO 日期字符串（生成时刻 / 用户自定义日期）
       createdAt,          // 时间戳（用于排序 / 取最新一张）
       petName,            // 宠物名（用于详情页个性化）
       title,              // 拍立得标题（可编辑，默认“日常陪伴”，替换原固定配方名作为卡片主标题）
       note,               // 今日小记：一句话故事（轻量记录区）
       tags,               // 特别事件标签数组：['第一次尝试','开心瞬间','搞怪行为','出门玩耍','特别纪念日']
       onWall              // 是否已贴到展示墙
     }

   存储：localStorage['pawlaroid_memories']（数组，独立 key，不触碰 pawlaroid_wall）。
   时光机 = 全部回忆（时间排序）；展示墙 = 当前/选中回忆（按 id 引用）；首页 = 最新一张。
   ============================================================ */
const PawMemory = {
    KEY: 'pawlaroid_memories',

    _read() {
        try {
            const raw = localStorage.getItem(this.KEY);
            const arr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(arr)) return [];
            // 每次读取时兼容旧版本 schema（polaroidImage/handwrittenText），
            // 让老用户此前保存的回忆在新版依然能正常显示，且不破坏既有存储。
            return arr.map(r => this._migrate(r));
        } catch (e) {
            return [];
        }
    },

    /**
     * 旧 schema 兼容：把 V18 之前的字段名映射为新字段。
     *  - polaroidImage → image
     *  - handwrittenText → text
     *  - 无 id 的极老数据：派生稳定 id，便于定位/去重
     *  - 补 createdAt 用于排序
     * 不删除旧字段，保持幂等、可重复读取。
     */
    _migrate(r) {
        if (!r || typeof r !== 'object') return r;
        const out = Object.assign({}, r);
        if (out.image === undefined) out.image = out.polaroidImage;
        if (out.text === undefined) out.text = out.handwrittenText;
        if (!out.id) {
            out.id = 'm_legacy_' + (out.image ? String(out.image).length : 0) + '_' + (out.date || '');
        }
        if (out.createdAt === undefined) {
            out.createdAt = Date.parse(out.date) || 0;
        }
        // 拍立得标题：旧数据无 title 时，沿用原 text（配方名，如“日常陪伴”）兜底，
        // 保证老回忆在时光机里依旧有主标题、不出现空标题。
        if (out.title === undefined) out.title = out.text || '日常陪伴';
        // 今日小记：V 起为字符串，现升级为“爪印列表”（string[]）。
        // 旧字符串按换行拆成多条；无内容则为空数组，保证各消费方一致。
        if (!Array.isArray(out.note)) {
            out.note = (typeof out.note === 'string' && out.note.trim())
                ? out.note.split('\n').map(s => s.trim()).filter(Boolean)
                : [];
        }
        if (!Array.isArray(out.tags)) out.tags = [];
        return out;
    },

    _write(arr) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(arr));
            return true;
        } catch (e) {
            const quota = (e && (e.name === 'QuotaExceededError' || e.code === 22));
            console.warn('[PawMemory] 保存失败', quota ? '（本地存储已满）' : '', e);
            if (quota && typeof window !== 'undefined' && window.App && window.App.toast) {
                window.App.toast('本地存储空间已满，无法保存更多回忆。请删除部分旧照片，或导出备份后清空。');
            }
            return false;
        }
    },

    /** 全部回忆（未排序，调用方按需排序） */
    all() {
        return this._read();
    },

    /** 最新一条回忆（按 createdAt 降序，回退到 date） */
    latest() {
        const arr = this._read();
        if (!arr.length) return null;
        arr.sort((a, b) =>
            (b.createdAt || Date.parse(b.date) || 0) - (a.createdAt || Date.parse(a.date) || 0));
        return arr[0];
    },

    /**
     * 新增 / 合并一条回忆。
     * 以唯一 id 为主键累积：同 id 合并字段（保留已上墙等状态，不重复），
     * 不同 id（不同一次生成）则各成一条独立记录 —— 这样时光机才会真正
     * 成为“宠物成长回忆库”，而不是只显示最新一张（不再按图片内容去重）。
     * @returns {string} 该回忆的 id
     */
    add(rec) {
        const arr = this._read();
        if (rec.id) {
            const idx = arr.findIndex(r => r.id === rec.id);
            if (idx >= 0) {
                // 同 id：原地合并。onWall 取“或”——只要曾经上墙，就保持已上墙状态，
                // 避免“去时光机”等动作把已上墙标记覆盖回 false。
                const merged = Object.assign({}, arr[idx], rec);
                merged.onWall = !!(rec.onWall || arr[idx].onWall);
                arr[idx] = merged;
                this._write(arr);
                return rec.id;
            }
            // 有唯一 id 但库里没有 → 直接新增一条独立记录。
            // 关键：绝不回退到“按图片内容去重”，否则同一张宠物不同次的拍立得会被合并，
            // 时光机就只会显示最新一张（这正是要修复的问题）。
            arr.push(rec);
            this._write(arr);
            return rec.id;
        }
        // 老数据兜底（无 id）：按图片内容去重，避免完全重复
        const idxByImg = arr.findIndex(r => r.image === rec.image);
        if (idxByImg >= 0) {
            arr[idxByImg] = Object.assign({}, arr[idxByImg], rec, { id: arr[idxByImg].id });
            this._write(arr);
            return arr[idxByImg].id;
        }
        rec.id = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1e4);
        arr.push(rec);
        this._write(arr);
        return rec.id;
    },

    get(id) {
        return this._read().find(r => r.id === id) || null;
    },

    /**
     * 局部更新一条回忆（时光机卡片内联编辑用）。
     * 以 id 定位，合并 patch 字段，保留其余字段不变；
     * onWall 走“或”逻辑，避免被覆盖回 false。写入失败（如配额满）返回 false。
     * @param {string} id
     * @param {object} patch 需更新的字段（如 {title} / {note} / {tags}）
     * @returns {boolean} 是否保存成功
     */
    update(id, patch) {
        if (!id || !patch || typeof patch !== 'object') return false;
        const arr = this._read();
        const idx = arr.findIndex(r => r.id === id);
        if (idx < 0) return false;
        const merged = Object.assign({}, arr[idx], patch);
        if ('onWall' in patch) merged.onWall = !!(patch.onWall || arr[idx].onWall);
        arr[idx] = merged;
        return this._write(arr);
    },

    /** 标记某条回忆已贴到展示墙（用于导航/统计） */
    markOnWall(id) {
        const arr = this._read();
        const r = arr.find(x => x.id === id);
        if (r) { r.onWall = true; this._write(arr); }
    },

    remove(id) {
        this._write(this._read().filter(r => r.id !== id));
    },

    clear() {
        this._write([]);
    }
};

if (typeof window !== 'undefined') window.PawMemory = PawMemory;
