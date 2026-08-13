/* 相纸配置（frames/frames.js）— file:// 兜底（只读 demo 子集，避免 404）
 * http(s) 下由 PaperStyles 按 USE_R2 选择 frames.json(全) / frames.demo.json(子集)。
 * 路径相对化（frames/xxx.webp），由 js/assetConfig.js 的 resolve() 拼前缀。
 * 仓库不含任何内联 base64 原图；完整二进制原图独立存储于 Cloudflare R2。
 */
window.PAW_FRAMES = [
  { "name": "经典白边", "thumbnail": "frames/classic_white.webp", "image": "frames/classic_white.webp" },
  { "name": "森林绿色", "thumbnail": "frames/forest_green.webp",  "image": "frames/forest_green.webp" },
  { "name": "海洋蓝色", "thumbnail": "frames/ocean_blue.webp",    "image": "frames/ocean_blue.webp" }
];