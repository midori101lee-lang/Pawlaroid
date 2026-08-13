/* 工具（图钉）配置（pins.js）
 * 通过 <script src="./pins/pins.js"></script> 加载，
 * file:// 与 http(s) 均可正常读取。
 *
 * 图钉用「内联 SVG（data URI）」表示，无需额外二进制资源，跨环境安全。
 * 这里基于 WorkBuddy 经典毛毡墙图钉样式（圆头 + 高光 + 阴影底座 + 小柄），
 * 仅对头部渐变做颜色换色，保留原有立体感 / 阴影 / 钉入角落的视觉效果。
 *
 * 扩展方式：在 buildPins() 数组里继续加 { id, name, light, mid, dark } 即可，
 * 颜色用三档（高光 / 主色 / 暗部）保证立体感；wall.js 读取 window.PAW_PINS 渲染。
 */
(function () {
    /* 生成一只可爱毛毡墙图钉的 SVG data URI（head 用三档颜色营造立体感） */
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
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    /* 颜色表：light=高光, mid=主色, dark=暗部 */
    const buildPins = [
        { id: 'pin_orange', name: '橙色图钉', light: '#FF9A6B', mid: '#FF6B3D', dark: '#E14B22' }, // 原始经典色，保留
        { id: 'pin_red',    name: '红色图钉', light: '#FF9A9A', mid: '#F4605A', dark: '#C62B22' },
        { id: 'pin_yellow', name: '黄色图钉', light: '#FFE08A', mid: '#FFC23D', dark: '#E09A14' },
        { id: 'pin_blue',   name: '蓝色图钉', light: '#A6C8FF', mid: '#4D8DFC', dark: '#2C63D6' },
        { id: 'pin_green',  name: '绿色图钉', light: '#A6E6A0', mid: '#5FCB6B', dark: '#2F9B47' },
        { id: 'pin_pink',   name: '粉色图钉', light: '#FFB0D4', mid: '#FF7EB4', dark: '#E84F95' }
    ];

    window.PAW_PINS = buildPins.map(p => ({
        id: p.id,
        name: p.name,
        file: makePinSvg(p.light, p.mid, p.dark),
        defaultSize: 56
    }));
})();
