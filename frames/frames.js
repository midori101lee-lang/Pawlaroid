/* 相纸配置（frames/frames.js）
 * 通过 <script src="./frames/frames.js"></script> 加载，
 * file:// 与 http(s) 两种环境下都能被浏览器正常读取。
 *
 * GitHub 公开版：**不含内联 base64**，相纸图片改为
 * public-assets/frames/*.webp 相对路径（http 同源加载，不污染画布）。
 * 与 frames.json 内容保持一致：新增相纸时在两者各加一行。
 *
 * 本地开发完整副本见 宠物拍立得/（保留 base64 以兼容 file:// 双击）。
 */
window.PAW_FRAMES = [
  { "name": "经典白边", "thumbnail": "public-assets/frames/classic_white.webp", "image": "public-assets/frames/classic_white.webp" },
  { "name": "森林绿色", "thumbnail": "public-assets/frames/forest_green.webp", "image": "public-assets/frames/forest_green.webp" },
  { "name": "海洋蓝色", "thumbnail": "public-assets/frames/ocean_blue.webp", "image": "public-assets/frames/ocean_blue.webp" }
];
