/* 导出专用资源（公开版，全部素材随仓库部署）
 * 背景与贴纸走仓库内 assets/ 下的同源 WebP（由 assetConfig.resolve() 统一解析），
 * 同源加载，导出时不污染 canvas。无内联 base64、无远程资源、无 R2。
 */
var __AC_X = window.ASSET_CONFIG || { resolve: function (p) { return 'assets/' + p; } };

window.PAW_WALL_BG = __AC_X.resolve('backgrounds/wall-bg.webp');

// 贴纸绘制源不再硬编码：Exporter._resolveStickerSrc 经 AssetManager 反查
// assets/config/stickers.json（配置驱动，提交系统新增贴纸无需改此文件）。
