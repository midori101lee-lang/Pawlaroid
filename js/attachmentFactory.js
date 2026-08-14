/* ============================================================
   attachmentFactory.js — 固定件（图钉/纽扣/磁铁）SVG 生成器
   ------------------------------------------------------------
   设计原则（与素材管理提交系统一致）：
     · 配置（assets/config/pins.json）只描述「画什么」：
       type / 颜色参数 / size / 适配主题(wallTheme)。
     · 本文件只负责「怎么画」：把参数渲染成内联 SVG data URI。
     · 新增一种固定件 = 往 pins.json 加一条；本文件无需改动
       （除非要新增一种全新的 shape/type）。
   图钉/纽扣/磁铁均用内联 SVG（data URI），跨环境安全、
   不污染 canvas，file:// 与 http(s) 下导出均可用。
   ============================================================ */
(function () {
    function enc(s) { return 'data:image/svg+xml,' + encodeURIComponent(s); }

    /* 经典毛毡墙图钉：圆头 + 三档渐变 + 高光 + 阴影底座 + 小柄 */
    function makePinSvg(light, mid, dark) {
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="72" viewBox="0 0 60 72">
  <defs>
    <radialGradient id="head" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="55%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </radialGradient>
  </defs>
  <ellipse cx="30" cy="64" rx="13" ry="5" fill="rgba(120,70,40,0.28)"/>
  <path d="M30 30 L26 58 Q30 63 34 58 Z" fill="#C9A06A"/>
  <circle cx="30" cy="26" r="20" fill="url(#head)"/>
  <ellipse cx="23" cy="19" rx="7" ry="5" fill="rgba(255,255,255,0.55)"/>
</svg>`.trim();
        return enc(svg);
    }

    /* 木质/复古纽扣：圆木 + 中间四孔 + 缝线 + 高光 */
    function makeButtonSvg(r1, r2, r3, r4, rh, stitch) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <ellipse cx="40" cy="71" rx="24" ry="6" fill="rgba(90,55,30,0.22)"/>
  <circle cx="40" cy="44" r="35" fill="${r4}"/>
  <circle cx="40" cy="40" r="35" fill="${r3}"/>
  <circle cx="40" cy="40" r="27" fill="${r2}"/>
  <circle cx="40" cy="40" r="20" fill="${r1}"/>
  <circle cx="40" cy="40" r="25" fill="none" stroke="${stitch}" stroke-width="1.6" stroke-dasharray="4 3.2" opacity="0.7"/>
  <g fill="${rh}">
    <circle cx="32" cy="32" r="2.6"/><circle cx="48" cy="32" r="2.6"/>
    <circle cx="32" cy="48" r="2.6"/><circle cx="48" cy="48" r="2.6"/>
  </g>
  <ellipse cx="31" cy="27" rx="9" ry="6" fill="rgba(255,255,255,0.35)"/>
</svg>`;
        return enc(svg);
    }

    const SH = 'xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"';

    /* 花形磁铁 */
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

    /* 星形磁铁 */
    function star(li, mi, da, edge, hi) {
        function pt(r, deg) { const a = (deg - 90) * Math.PI / 180; return (40 + r * Math.cos(a)).toFixed(1) + ',' + (40 + r * Math.sin(a)).toFixed(1); }
        let outer = [], inner = [];
        for (let i = 0; i < 5; i++) { outer.push(pt(30, i * 72)); inner.push(pt(13, i * 72 + 36)); }
        const d = 'M' + outer[0] + ' L' + inner[0] + ' L' + outer[1] + ' L' + inner[1] + ' L' + outer[2] + ' L' + inner[2] + ' L' + outer[3] + ' L' + inner[3] + ' L' + outer[4] + ' L' + inner[4] + ' Z';
        return `<svg ${SH}><defs><radialGradient id="m" cx="40%" cy="30%" r="78%">
          <stop offset="0%" stop-color="${li}"/><stop offset="60%" stop-color="${mi}"/><stop offset="100%" stop-color="${da}"/>
        </radialGradient></defs>
        <ellipse cx="40" cy="71" rx="18" ry="5" fill="rgba(60,60,80,0.18)"/>
        <path d="${d}" fill="url(#m)" stroke="${edge}" stroke-width="2"/>
        <ellipse cx="33" cy="30" rx="8" ry="5" fill="${hi}"/></svg>`;
    }

    /* 心形磁铁 */
    function heart(li, mi, da, edge, hi) {
        return `<svg ${SH}><defs><radialGradient id="m" cx="40%" cy="32%" r="78%">
          <stop offset="0%" stop-color="${li}"/><stop offset="60%" stop-color="${mi}"/><stop offset="100%" stop-color="${da}"/>
        </radialGradient></defs>
        <ellipse cx="40" cy="72" rx="18" ry="5" fill="rgba(60,60,80,0.18)"/>
        <path d="M40 64 C16 47 13 30 25 23 C33 18 40 24 40 30 C40 24 47 18 55 23 C67 30 64 47 40 64 Z" fill="url(#m)" stroke="${edge}" stroke-width="2"/>
        <ellipse cx="32" cy="32" rx="6" ry="4" fill="${hi}"/></svg>`;
    }

    function makeMagnetSvg(shape, li, mi, da, edge, hi) {
        if (shape === 'star') return enc(star(li, mi, da, edge, hi));
        if (shape === 'heart') return enc(heart(li, mi, da, edge, hi));
        return enc(flower(li, mi, da, edge, hi)); // 默认花形
    }

    /* 统一入口：根据配置项渲染出 file（data URI）。
       cfg 字段由 assets/config/pins.json 提供，本函数不关心业务。 */
    function create(cfg) {
        if (!cfg) return '';
        if (cfg.type === 'pin') return makePinSvg(cfg.light, cfg.mid, cfg.dark);
        if (cfg.type === 'button') return makeButtonSvg(cfg.r1, cfg.r2, cfg.r3, cfg.r4, cfg.rh, cfg.stitch);
        if (cfg.type === 'magnet') return makeMagnetSvg(cfg.shape, cfg.li, cfg.mi, cfg.da, cfg.edge, cfg.hi);
        if (cfg.type === 'image') return cfg.file || '';  // 真实位图素材
        return cfg.file || '';
    }

    window.AttachmentFactory = { create, makePinSvg, makeButtonSvg, makeMagnetSvg, flower, star, heart };
})();
