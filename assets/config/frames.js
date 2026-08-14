/* 相纸配置兜底（assets/config/frames.js）— file:// 下 fetch 本地 JSON 被 CORS 拦截时的注入。
 * http(s) 下由 AssetManager 读取 assets/config/frames.json（同源，始终最新）；
 * 此文件与 frames.json 内容需保持一致（提交系统会自动同步两者）。 */
window.PAW_FRAMES = [
  { "name": "经典白边", "thumbnail": "frames/classic_white.webp", "image": "frames/classic_white.webp" },
  { "name": "森林绿色", "thumbnail": "frames/forest_green.webp",  "image": "frames/forest_green.webp" },
  { "name": "海洋蓝色", "thumbnail": "frames/ocean_blue.webp",    "image": "frames/ocean_blue.webp" },
  { "name": "小卷橙色", "thumbnail": "frames/xiaojuan_orange.webp", "image": "frames/xiaojuan_orange.webp" },
  { "name": "小卷紫色", "thumbnail": "frames/xiaojuan_purple.webp", "image": "frames/xiaojuan_purple.webp" },
  { "name": "小卷绿色", "thumbnail": "frames/xiaojuan_green.webp",  "image": "frames/xiaojuan_green.webp" }
];
