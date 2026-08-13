/* ============================================================
   assets.js — 视觉资产统一配置（标题 / 贴纸 / 边框等图片资源路径）
   ------------------------------------------------------------
   作用：把图片资源路径集中到单一来源，避免硬编码到多个文件中，
        方便未来替换不同主题版本（如节日版标题、品牌联名边框）。

   ⚠️ 路径约定（与项目硬约束一致）：
     - 使用「相对站点根」的路径（如 'public-assets/titles/xxx.webp'），
       不要用 '/' 开头、也不要写 localhost / http:// / file://，
       否则 file:// 双击打开时图片会 404。
     - 资源一律 WebP（保留透明 alpha），不用 PNG。
     - 标题图统一经 js/assetConfig.js 的 ASSET_CONFIG.resolve() 解析：
       DEMO_MODE=true（默认）走 public-assets/，本地完整素材走外部目录。
   ============================================================ */
window.PAW_ASSETS = window.PAW_ASSETS || {};

/* 统一经 assetConfig 解析；未加载时回退硬编码公开路径 */
var __AC = window.ASSET_CONFIG;
var __tmTitle = (__AC && typeof __AC.resolve === 'function')
    ? __AC.resolve('titles/time-machine-title.webp')
    : 'public-assets/titles/time-machine-title.webp';

window.PAW_ASSETS = Object.assign(window.PAW_ASSETS, {
    // 时光机顶部标题视觉（替代原“⏳ 时光机 / 和 TA 一起生活的每一天”文字）
    timeMachineTitle: __tmTitle,
    // 未来可在此扩展：
    // wallTitle: (__AC && typeof __AC.resolve === 'function') ? __AC.resolve('titles/wall-title.webp') : 'public-assets/titles/wall-title.webp',
});
