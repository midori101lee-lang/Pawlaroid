/* 贴纸配置（stickers/stickers.js）— file:// 兜底（只读 demo 子集，避免 404）
 * http(s) 下由 Wall 按 USE_R2 选择 stickers.json(全) / stickers.demo.json(子集)。
 * 路径相对化（stickers/xxx.webp），由 js/assetConfig.js 的 resolve() 拼前缀。
 * 仓库不含任何内联 base64 原图；完整二进制原图独立存储于 Cloudflare R2。
 */
window.PAW_STICKERS = [
  { "id": "bone_orange",  "name": "橙色骨头", "image": "stickers/orangebone.webp",   "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 92  },
  { "id": "cactus",       "name": "仙人掌",   "image": "stickers/xianrenzhang.webp", "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 96  },
  { "id": "water",        "name": "小雨滴",   "image": "stickers/water.webp",        "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 84  }
];
