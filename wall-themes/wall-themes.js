/* 展示墙主题配置（wall-themes.js）
 * 通过 <script src="./wall-themes/wall-themes.js"></script> 加载（file:// 友好）；
 * http(s) 下 wall.js 会优先 fetch 同目录 wall-themes.json（改 JSON 即生效）。
 *
 * 设计理念：
 *   · 时光机 = 宠物成长日记（手帐风）；展示墙 = 收藏宠物回忆的空间（真实拍立得墙，不要手帐风）。
 *   · 主题只决定三件事：背景图（CSS）、固定方式（pin/button/magnet）、工具栏装饰集。
 *   · 照片 / 贴纸 / 图钉 原有数据结构与交互一律不改，仅 attachmentType 由主题驱动。
 *
 * 三个第一阶段主题：
 *   felt（默认，毛毡照片板，📌 图钉）— 奶油白 / 鼠尾草绿 / 雾霾蓝 / 樱花粉 四色变体
 *   cork（软木照片墙，📌 纽扣图钉，木质手工感）
 *   fridge（冰箱磁贴墙，🧲 磁铁，家庭生活感）
 */
(function () {
    window.PAW_WALL_THEMES = [
        {
            id: 'felt',
            name: '毛毡照片板',
            icon: '🎨',
            attachment: 'pin',          // 固定方式：图钉
            decorSet: 'pins',           // 工具栏装饰集（window.PAW_PINS）
            defaultVariant: 'cream',
            variants: [
                { id: 'cream', name: '奶油白',     file: 'backgrounds/felt-cream.webp', overlay: 'linear-gradient(180deg, rgba(255,252,245,0.10), rgba(238,222,194,0.22))', accent: '#E2A35B', titleColor: '#6B4A2E' },
                { id: 'sage',  name: '鼠尾草绿',   file: 'backgrounds/felt-sage.webp',  overlay: 'linear-gradient(180deg, rgba(232,240,225,0.10), rgba(176,192,160,0.26))', accent: '#7FA079', titleColor: '#3F5A3C' },
                { id: 'misty', name: '雾霾蓝',     file: 'backgrounds/felt-misty.webp',  overlay: 'linear-gradient(180deg, rgba(214,226,238,0.10), rgba(150,175,200,0.26))', accent: '#8AA0BC', titleColor: '#3F4E63' },
                { id: 'sakura', name: '樱花粉',    file: 'backgrounds/felt-sakura.webp', overlay: 'linear-gradient(180deg, rgba(248,228,236,0.12), rgba(224,170,196,0.26))', accent: '#D98AAE', titleColor: '#7A4A5C' }
            ]
        },
        {
            id: 'cork',
            name: '软木照片墙',
            icon: '🌰',
            attachment: 'button',       // 固定方式：纽扣图钉（木质手工感）
            decorSet: 'buttons',        // 工具栏装饰集（window.PAW_BUTTONS）
            defaultVariant: 'cream',
            variants: [
                { id: 'cream', name: '奶油木纽扣', file: 'backgrounds/cork.webp', overlay: 'linear-gradient(180deg, rgba(255,248,236,0.06), rgba(150,105,60,0.20))', accent: '#A8763A', titleColor: '#6B4723' }
            ]
        },
        {
            id: 'fridge',
            name: '冰箱磁贴墙',
            icon: '🧲',
            attachment: 'magnet',        // 固定方式：磁铁
            decorSet: 'magnets',         // 工具栏装饰集（window.PAW_MAGNETS）
            defaultVariant: 'cream',
            variants: [
                { id: 'cream', name: '糖果磁铁', file: 'backgrounds/fridge.webp', overlay: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(210,225,235,0.18))', accent: '#5C97F4', titleColor: '#3A5E8C' }
            ]
        }
    ];
})();
