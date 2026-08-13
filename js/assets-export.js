/* 导出专用资源（GitHub 公开版）
 * 背景与贴纸改为 public-assets/ 下的相对路径（WebP 文件），
 * 由 assetConfig.resolve() 统一解析；http 同源加载，不会污染 canvas。
 *
 * 说明：本地开发完整副本（宠物拍立得/）仍内联 dataURI 以兼容
 * file:// 双击导出；本仓库版不含任何内联 base64 原图。
 */
var __AC_X = window.ASSET_CONFIG || { resolve: function (p) { return 'public-assets/' + p; } };

window.PAW_WALL_BG = __AC_X.resolve('backgrounds/wall-bg.webp');

window.PAW_STICKER_DATAURI = {
  'bone_orange':        __AC_X.resolve('stickers/orangebone.webp'),
  'orangebone.webp':   __AC_X.resolve('stickers/orangebone.webp'),
  'cactus':            __AC_X.resolve('stickers/xianrenzhang.webp'),
  'xianrenzhang.webp': __AC_X.resolve('stickers/xianrenzhang.webp'),
  'water':             __AC_X.resolve('stickers/water.webp'),
  'water.webp':        __AC_X.resolve('stickers/water.webp')
};
