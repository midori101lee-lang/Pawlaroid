/* 贴纸配置（stickers/stickers.js）
 * 应用读取 window.PAW_STICKERS（<script> 注入），
 * http(s) 下也可 fetch ./stickers/stickers.json 刷新生效。
 *
 * GitHub 公开版仅含「代表性」3 张贴纸，图片指向
 * public-assets/stickers/*.webp（http 同源，不污染画布）。
 *
 * 本地开发完整贴纸库见 宠物拍立得/（完整 9 张）。
 *
 * 扩展方式：在 public-assets/stickers/ 放入新 WebP，在此数组与
 * stickers.json 各加一行 { id, name, image, type, defaultScale, defaultRotation, defaultSize }。
 */
window.PAW_STICKERS = [
  { "id": "bone_orange",  "name": "橙色骨头", "image": "public-assets/stickers/orangebone.webp",     "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 92 },
  { "id": "cactus",       "name": "仙人掌",   "image": "public-assets/stickers/xianrenzhang.webp",  "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 96 },
  { "id": "water",        "name": "小雨滴",   "image": "public-assets/stickers/water.webp",         "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 84 }
];
