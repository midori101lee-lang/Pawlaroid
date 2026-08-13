/* 贴纸配置（stickers/stickers.js）— file:// 兜底（同源 WebP，绝对可用）
 * http(s) 下由 Wall 读取 stickers/stickers.json（同源，始终最新）；
 * file:// 直接打开时改走本文件注入的 window.PAW_STICKERS。
 * 路径相对化（stickers/xxx.webp），由 js/assetConfig.js 的 resolve() 拼前缀。
 * 仓库不含任何内联 base64 原图；全部贴纸随仓库公开部署。
 */
window.PAW_STICKERS = [
  { "id": "bone_orange",  "name": "橙色骨头", "image": "stickers/orangebone.webp",     "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 92  },
  { "id": "cactus",       "name": "仙人掌",   "image": "stickers/xianrenzhang.webp",  "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 96  },
  { "id": "cat_orange",   "name": "憨厚橘猫", "image": "stickers/orangecat.webp",      "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 116 },
  { "id": "water",        "name": "小雨滴",   "image": "stickers/water.webp",          "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 84  },
  { "id": "apple_red",    "name": "迷你苹果", "image": "stickers/applered.webp",       "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 82  },
  { "id": "juan_sitting", "name": "小卷坐姿", "image": "stickers/xiaojuansitting.webp","type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 132 },
  { "id": "ocean_fish",   "name": "海洋小鱼", "image": "stickers/oceanfish.webp",      "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 96  },
  { "id": "snack",        "name": "小零食",   "image": "stickers/snack.webp",          "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 96  },
  { "id": "back_view",    "name": "小背影",   "image": "stickers/back.webp",           "type": "sticker", "defaultScale": 1, "defaultRotation": 0, "defaultSize": 96  }
];
