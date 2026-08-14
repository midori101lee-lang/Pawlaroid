/* ============================================================
   assetConfig.js — 资源路径单一来源（公开版）
   ------------------------------------------------------------
   Pawlaroid 现已改为「全部原创素材随仓库公开部署」：
   相框 / 贴纸 / 背景 / 标题等 WebP 统一放在仓库 assets/ 下，
   由 Cloudflare Pages 直接同源托管，打开即玩、无需任何远程 / CDN / 私有存储。

   本文件只做一件事：把「相对站点根」的资源路径拼上统一前缀 'assets/'，
   供各加载层（paperStyles / wall / polaroid / exporter / assets-export）共用，
   避免把路径写死在多处。不含任何 R2 / demo / 占位 / 远程逻辑。
   ============================================================ */
(function () {
  var BASE = 'assets/';                       // 资源统一基路径（仓库内，随 Pages 部署）

  window.ASSET_CONFIG = {
    base: BASE,

    // 统一拼前缀：resolve('frames/x.webp') -> 'assets/frames/x.webp'
    // 逻辑资产键（homeHero/wallBg/tmTitle...）已移交 js/assetManager.js 的
    // AssetManager.logical(key)，避免两处维护。
    resolve: function (p) { return BASE + p; }
  };
})();
