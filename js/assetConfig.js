/* ============================================================
   assetConfig.js — 统一资源管理（DEV 完整素材 vs DEMO 公开素材）
   ------------------------------------------------------------
   仓库默认 DEMO_MODE = true：所有图片走仓库内的 public-assets/
   （代表性素材，可公开）。

   本地开发：把 DEMO_MODE 改为 false，并把完整素材放到外部目录
   （见 ../Pawlaroid-private-assets/，物理隔离、不进仓库），
   此时 resolve() 指向外部完整素材。

   注意：fallback 仅作异常保护，正常不应触发 404 回退链。
   ============================================================ */
(function () {
  var DEMO_MODE = true;

  // 仓库内：代表性公开素材
  var PUBLIC = 'public-assets/';
  // 本地开发：外部完整素材（物理隔离，永不进仓库）
  var PRIVATE = '../Pawlaroid-private-assets/';

  var base = DEMO_MODE ? PUBLIC : PRIVATE;

  window.ASSET_CONFIG = {
    DEMO_MODE: DEMO_MODE,
    base: base,
    resolve: function (p) { return base + p; },

    // 逻辑资产键（代码统一走这里，避免散落硬编码）
    homeHero: 'home/hero.webp',
    boneCta: 'home/bone-cta.webp',
    wallBg: 'backgrounds/wall-bg.webp',
    tmTitle: 'titles/time-machine-title.webp',
    framesDir: 'frames/',
    stickersDir: 'stickers/'
  };
})();
