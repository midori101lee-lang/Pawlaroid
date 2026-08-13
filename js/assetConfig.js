/* ============================================================
   assetConfig.js — 统一资源管理（R2 完整素材 vs DEMO 公开素材）
   ------------------------------------------------------------
   两阶段素材策略（保护原创视觉资产：代码公开、二进制不进 GitHub）：

   ① DEMO 模式（默认，USE_R2 = false）：
      - 所有图片走仓库内 public-assets/（仅代表性降采样子集）。
      - 运行时仅加载 demo manifest（frames/frames.demo.json、
        stickers/stickers.demo.json，各 3 个），公开仓库零 404。

   ② R2 模式（USE_R2 = true）：
      - 完整原创素材经 Cloudflare R2（r2.dev 公共访问）加载。
      - 运行时加载 full manifest（frames/frames.json、
        stickers/stickers.json，全部 6 相框 / 6 贴纸），
        用户可体验完整版本；GitHub 只保留元数据，不传二进制。

   所有路径统一“相对化”（frames/xxx.webp），由 resolve() 拼前缀。
   不内嵌 base64；合成 / 展示墙 / 导出算法不变，只改资源获取层。
   ============================================================ */
(function () {
  // —— 第一阶段素材 CDN：Cloudflare R2 公共访问（r2.dev）。
  //    设为 true 即启用完整素材（经 R2）；默认 false 仅用 public-assets/ 子集。
  var USE_R2 = false;

  // TODO: 在 Cloudflare 创建 Bucket「pawlaroid-assets」并开启 Public Access 后，
  //       把下行替换为你的 r2.dev 地址（形如 https://<bucket>.<accountid>.r2.dev/）。
  //       替换并设 USE_R2 = true 后，线上即恢复完整相框 / 贴纸 / 墙背景。
  var R2_BASE = 'https://<R2_BUCKET>.<ACCOUNT_ID>.r2.dev/';

  // 仓库内代表性公开素材（降采样子集，可公开）
  var PUBLIC = 'public-assets/';

  var base = USE_R2 ? R2_BASE : PUBLIC;

  // 运行时清单：R2 开启用 full（全部），否则用 demo（子集）。避免公开仓库 404。
  var FRAME_MANIFEST   = USE_R2 ? 'frames/frames.json'     : 'frames/frames.demo.json';
  var STICKER_MANIFEST = USE_R2 ? 'stickers/stickers.json'  : 'stickers/stickers.demo.json';

  window.ASSET_CONFIG = {
    USE_R2: USE_R2,
    base: base,
    r2Base: R2_BASE,

    // 运行时加载的清单文件（由 paperStyles / wall 读取）
    frameManifest: FRAME_MANIFEST,
    stickerManifest: STICKER_MANIFEST,

    // 统一拼前缀：resolve('frames/x.webp')
    //   -> public-assets/frames/x.webp （DEMO）或 <R2>/frames/x.webp （R2）
    resolve: function (p) { return base + p; },
    // 永远走仓库内公开子集（即便 R2 开启，也可用此取 demo 兜底图）
    resolvePublic: function (p) { return PUBLIC + p; },

    // 逻辑资产键（代码统一走这里，避免散落硬编码）
    homeHero: 'home/hero.webp',
    boneCta: 'home/bone-cta.webp',
    wallBg: 'backgrounds/wall-bg.webp',
    tmTitle: 'titles/time-machine-title.webp',
    framesDir: 'frames/',
    stickersDir: 'stickers/'
  };
})();
