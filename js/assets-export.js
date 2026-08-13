/* 导出专用资源（GitHub 公开版）
 * 背景与贴纸改为相对路径（WebP 文件），由 assetConfig.resolve() 统一解析；
 * http 同源（DEMO）或 R2 跨域（USE_R2）加载，导出时不污染 canvas。
 *
 * 此文件保留“完整素材元数据”（全部 6 贴纸的 id → 文件名映射），
 * 但仓库不含任何内联 base64 原图；完整二进制原图独立存储于 Cloudflare R2。
 * 本地开发完整副本（宠物拍立得/）仍内联 dataURI 以兼容 file:// 双击导出。
 */
var __AC_X = window.ASSET_CONFIG || { resolve: function (p) { return 'public-assets/' + p; } };

window.PAW_WALL_BG = __AC_X.resolve('backgrounds/wall-bg.webp');

// 完整 6 贴纸映射（id / 文件名 双向），与 stickers/stickers.json 保持一致
window.PAW_STICKER_DATAURI = {
  // 橙色骨头
  'bone_orange':      __AC_X.resolve('stickers/orangebone.webp'),
  'orangebone.webp': __AC_X.resolve('stickers/orangebone.webp'),
  // 仙人掌
  'cactus':           __AC_X.resolve('stickers/xianrenzhang.webp'),
  'xianrenzhang.webp': __AC_X.resolve('stickers/xianrenzhang.webp'),
  // 憨厚橘猫
  'cat_orange':       __AC_X.resolve('stickers/orangecat.webp'),
  'orangecat.webp':   __AC_X.resolve('stickers/orangecat.webp'),
  // 小雨滴
  'water':            __AC_X.resolve('stickers/water.webp'),
  'water.webp':       __AC_X.resolve('stickers/water.webp'),
  // 迷你苹果
  'apple_red':        __AC_X.resolve('stickers/applered.webp'),
  'applered.webp':    __AC_X.resolve('stickers/applered.webp'),
  // 小卷坐姿
  'juan_sitting':     __AC_X.resolve('stickers/xiaojuansitting.webp'),
  'xiaojuansitting.webp': __AC_X.resolve('stickers/xiaojuansitting.webp')
};
