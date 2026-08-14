/* 软木墙专用「纽扣图钉」配置（buttons.js）
 * 通过 <script src="./pins/buttons.js"></script> 加载；file:// 与 http(s) 均可读取。
 * 纽扣用「内联 SVG（data URI）」表示，无需额外二进制资源、跨环境安全。
 * 视觉参考：圆木纽扣 + 中间四孔 + 木质手工感 + 复古温暖 + 实体材料质感。
 * 由 wall-themes 在「软木照片墙」主题下读取 window.PAW_BUTTONS 渲染工具栏。
 */
(function () {
    function svg(r1, r2, r3, r4, rh, stitch, hi) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
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
    }
    function uri(s) { return 'data:image/svg+xml,' + encodeURIComponent(s); }

    /* 6 款木质/复古色纽扣（浅木→深木→陶土） */
    const B = [
        { id: 'btn_cream',   name: '奶油白纽扣', r1: '#FBF2DE', r2: '#F2E2C4', r3: '#E2C79B', r4: '#CBA874', rh: '#7A5634', stitch: '#C9A877' },
        { id: 'btn_tan',     name: '浅木纽扣',   r1: '#EBD3A6', r2: '#D8B97E', r3: '#C29E62', r4: '#A8814A', rh: '#6B4A28', stitch: '#B58F55' },
        { id: 'btn_caramel', name: '焦糖纽扣',   r1: '#D6A86B', r2: '#C08E4C', r3: '#A8763A', r4: '#8C5E2A', rh: '#5E3D1C', stitch: '#9C7236' },
        { id: 'btn_brown',   name: '原木纽扣',   r1: '#B98A55', r2: '#9E6F3E', r3: '#84592F', r4: '#6B4723', rh: '#47301A', stitch: '#7E5630' },
        { id: 'btn_terra',   name: '陶土红纽扣', r1: '#D38E6B', r2: '#BC6F4E', r3: '#A35636', r4: '#863F25', rh: '#5A2815', stitch: '#9B5435' },
        { id: 'btn_dark',    name: '深棕纽扣',   r1: '#9C6E44', r2: '#7E5230', r3: '#653F22', r4: '#4E2E16', rh: '#33200F', stitch: '#5E3A1F' }
    ];

    window.PAW_BUTTONS = B.map(b => ({
        id: b.id,
        name: b.name,
        file: uri(svg(b.r1, b.r2, b.r3, b.r4, b.rh, b.stitch)),
        defaultSize: 48,
        attachmentType: 'button'
    }));
})();
