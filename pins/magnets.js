/* 冰箱磁贴墙专用「磁铁」配置（magnets.js）
 * 通过 <script src="./pins/magnets.js"></script> 加载；file:// 与 http(s) 均可读取。
 * 磁铁用「内联 SVG（data URI）」表示，无需额外二进制资源、跨环境安全。
 * 三种形状（花 / 星 / 心）× 五种糖果色，风格：可爱陶瓷/搪瓷反光、温暖治愈、轻微拟物。
 * 由 wall-themes 在「冰箱磁贴墙」主题下读取 window.PAW_MAGNETS 渲染工具栏。
 */
(function () {
    const SH = `xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"`;
    function enc(s) { return 'data:image/svg+xml,' + encodeURIComponent(s); }

    function flower(li, mi, da, edge, hi) {
        let petals = '';
        for (let i = 0; i < 5; i++) {
            const a = (i * 72 - 90) * Math.PI / 180;
            const cx = 40 + 17 * Math.cos(a), cy = 40 + 17 * Math.sin(a);
            petals += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="url(#m)"/>`;
        }
        return `<svg ${SH}><defs><radialGradient id="m" cx="40%" cy="32%" r="75%">
          <stop offset="0%" stop-color="${li}"/><stop offset="60%" stop-color="${mi}"/><stop offset="100%" stop-color="${da}"/>
        </radialGradient></defs>
        <ellipse cx="40" cy="71" rx="19" ry="5" fill="rgba(60,60,80,0.18)"/>
        <g>${petals}</g><circle cx="40" cy="40" r="12" fill="${edge}"/>
        <circle cx="40" cy="40" r="12" fill="url(#m)" opacity="0.6"/>
        <ellipse cx="34" cy="33" rx="8" ry="5" fill="${hi}"/></svg>`;
    }

    function star(li, mi, da, edge, hi) {
        function pt(r, deg) { const a = (deg - 90) * Math.PI / 180; return (40 + r * Math.cos(a)).toFixed(1) + ',' + (40 + r * Math.sin(a)).toFixed(1); }
        let outer = [], inner = [];
        for (let i = 0; i < 5; i++) {
            outer.push(pt(30, i * 72));
            inner.push(pt(13, i * 72 + 36));
        }
        const d = 'M' + outer[0] + ' L' + inner[0] + ' L' + outer[1] + ' L' + inner[1] + ' L' + outer[2] + ' L' + inner[2] + ' L' + outer[3] + ' L' + inner[3] + ' L' + outer[4] + ' L' + inner[4] + ' Z';
        return `<svg ${SH}><defs><radialGradient id="m" cx="40%" cy="30%" r="78%">
          <stop offset="0%" stop-color="${li}"/><stop offset="60%" stop-color="${mi}"/><stop offset="100%" stop-color="${da}"/>
        </radialGradient></defs>
        <ellipse cx="40" cy="71" rx="18" ry="5" fill="rgba(60,60,80,0.18)"/>
        <path d="${d}" fill="url(#m)" stroke="${edge}" stroke-width="2"/>
        <ellipse cx="33" cy="30" rx="8" ry="5" fill="${hi}"/></svg>`;
    }

    function heart(li, mi, da, edge, hi) {
        return `<svg ${SH}><defs><radialGradient id="m" cx="40%" cy="32%" r="78%">
          <stop offset="0%" stop-color="${li}"/><stop offset="60%" stop-color="${mi}"/><stop offset="100%" stop-color="${da}"/>
        </radialGradient></defs>
        <ellipse cx="40" cy="72" rx="18" ry="5" fill="rgba(60,60,80,0.18)"/>
        <path d="M40 64 C16 47 13 30 25 23 C33 18 40 24 40 30 C40 24 47 18 55 23 C67 30 64 47 40 64 Z" fill="url(#m)" stroke="${edge}" stroke-width="2"/>
        <ellipse cx="32" cy="32" rx="6" ry="4" fill="${hi}"/></svg>`;
    }

    /* 5 种糖果色（高光 / 主色 / 暗部 / 边 / 高光块）；cn 为中文名，用于磁铁命名 */
    const C = {
        red:    { li: '#FF9C9C', mi: '#F56A6A', da: '#D94444', edge: '#C53B3B', hi: 'rgba(255,255,255,0.5)', cn: '红' },
        yellow: { li: '#FFE08A', mi: '#FFC23D', da: '#E8A013', edge: '#D4910F', hi: 'rgba(255,255,255,0.55)', cn: '黄' },
        blue:   { li: '#A9CCFF', mi: '#5C97F4', da: '#3A72D8', edge: '#2F62BD', hi: 'rgba(255,255,255,0.5)', cn: '蓝' },
        mint:   { li: '#B6EFD2', mi: '#69D6A4', da: '#3FBF87', edge: '#2FA873', hi: 'rgba(255,255,255,0.5)', cn: '薄荷' },
        pink:   { li: '#FFB6D6', mi: '#FF84BA', da: '#EF5C9E', edge: '#DD4A8C', hi: 'rgba(255,255,255,0.5)', cn: '粉' }
    };

    const SHAPES = [
        { id: 'flower', name: '花朵', fn: flower },
        { id: 'star',   name: '星星', fn: star },
        { id: 'heart',  name: '爱心', fn: heart }
    ];

    const list = [];
    SHAPES.forEach(shape => {
        Object.entries(C).forEach(([ckey, c]) => {
            list.push({
                id: 'magnet_' + shape.id + '_' + ckey,
                name: shape.name + c.cn,
                file: enc(shape.fn(c.li, c.mi, c.da, c.edge, c.hi)),
                defaultSize: 48,
                attachmentType: 'magnet'
            });
        });
    });

    window.PAW_MAGNETS = list;
})();
