/* 相纸配置（frames/frames.js）— file:// 兜底（同源 WebP，绝对可用）
 * http(s) 下由 PaperStyles 读取 frames/frames.json（同源，始终最新）；
 * file:// 直接打开时 fetch 被 CORS 拦截，改走本文件注入的 window.PAW_FRAMES。
 * 路径相对化（frames/xxx.webp），由 js/assetConfig.js 的 resolve() 拼前缀。
 * 仓库不含任何内联 base64 原图；全部相框随仓库公开部署。
 */
window.PAW_FRAMES = [
  { "name": "经典白边", "thumbnail": "frames/classic_white.webp", "image": "frames/classic_white.webp" },
  { "name": "森林绿色", "thumbnail": "frames/forest_green.webp",  "image": "frames/forest_green.webp" },
  { "name": "海洋蓝色", "thumbnail": "frames/ocean_blue.webp",    "image": "frames/ocean_blue.webp" },
  { "name": "小卷橙色", "thumbnail": "frames/xiaojuan_orange.webp", "image": "frames/xiaojuan_orange.webp" },
  { "name": "小卷紫色", "thumbnail": "frames/xiaojuan_purple.webp", "image": "frames/xiaojuan_purple.webp" },
  { "name": "小卷绿色", "thumbnail": "frames/xiaojuan_green.webp",  "image": "frames/xiaojuan_green.webp" }
];
