/* 导出专用资源（公开版，全部素材随仓库部署）
 * 背景与贴纸走仓库内 assets/ 下的同源 WebP（由 assetConfig.resolve() 统一解析），
 * 同源加载，导出时不污染 canvas。无内联 base64、无远程资源、无 R2。
 */
var __AC_X = window.ASSET_CONFIG || { resolve: function (p) { return 'assets/' + p; } };

window.PAW_WALL_BG = __AC_X.resolve('backgrounds/wall-bg.webp');

// 全部 9 贴纸映射（id / 文件名 双向），与 stickers/stickers.json 保持一致
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
  'xiaojuansitting.webp': __AC_X.resolve('stickers/xiaojuansitting.webp'),
  // 海洋小鱼
  'ocean_fish':       __AC_X.resolve('stickers/oceanfish.webp'),
  'oceanfish.webp':   __AC_X.resolve('stickers/oceanfish.webp'),
  // 小蛇
  'snake':            __AC_X.resolve('stickers/snake.webp'),
  'snake.webp':       __AC_X.resolve('stickers/snake.webp'),
  // 小背影
  'back_view':        __AC_X.resolve('stickers/back.webp'),
  'back.webp':        __AC_X.resolve('stickers/back.webp')
};
