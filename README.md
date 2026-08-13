# 🐾 Pawlaroid · 宠物胶片拍立得

把毛孩子的日常，冲洗成一页页会发光的拍立得。

Pawlaroid 是一个**零依赖、纯前端**的宠物回忆作品集：上传一张照片，挑选相纸与贴纸，
写下当天的悄悄话，再让它“冲洗”成一张带胶片质感的拍立得 —— 然后收进**时光机**
（按日期排布的成长日记）与**展示墙**（可自由摆布的回忆墙）。

> 它既是可运行的产品，也是一份“前端能力样品”：页面结构、组件逻辑、Canvas 合成、
> 展示墙布局、时光机长图导出、移动端保存到相册，全部用原生 HTML / CSS / JavaScript 实现，
> 不依赖任何框架或构建工具。

---

## 🔭 Preview（本地预览）

Pawlaroid 是静态站点，**无需安装任何依赖**。推荐用本地服务器打开
（直接 `file://` 双击会因浏览器安全策略污染 Canvas，导致“导出/保存图片”失败）：

```bash
# 进入仓库目录
cd Pawlaroid

# 任选其一启动本地服务器（默认端口 8000）
python3 -m http.server 8000
# 或
npx serve .

# 浏览器访问
open http://localhost:8000
```

部署到 GitHub Pages / Cloudflare Pages / 任意静态托管时，直接把本仓库根目录作为站点根即可，
所有资源都用相对路径，无需额外配置。

---

## ✨ Features

- **拍照 → 冲洗仪式**：选择相纸、手写留言、添加贴纸，点下“咔嚓”后有一段冲洗动画
  （快门闪光 / 相纸显影），把数字照片“变成”一张实体拍立得。
- **多款相纸**：内置经典白边等相纸样式，相纸清单由 `frames/` 配置驱动，可扩展。
- **贴纸 & 图钉**：展示墙上可自由拖拽贴纸、钉上图钉，记录与毛孩子的生活碎片。
- **时光机（Time Machine）**：按日期倒序、按天分组的成长长图，可导出为纪念长图。
- **展示墙（Wall）**：自由摆布的回忆墙，支持导出 4:5 纪念模板。
- **移动端友好**：保存图片优先调用系统原生分享（`navigator.share` → “存储到照片”），
  不支持时回退到长按保存 / 下载浮层。
- **本地优先**：所有回忆保存在浏览器 `localStorage`，不依赖后端；离线可用。
- **零依赖 & 轻量**：无打包、无框架；字体自托管并按需子集化，首屏素材经 WebP 压缩。

---

## 🛠 Tech & Architecture

| 维度 | 实现 |
| --- | --- |
| 语言 | 原生 HTML / CSS / JavaScript（ES2017+），零运行时依赖 |
| 图像合成 | Canvas 2D（`polaroid.js` 叠加相纸、`exporter.js` 渲染长图/模板） |
| 数据存储 | `localStorage`（`memory-store.js` 的 `PawMemory` 统一数据模型） |
| 资源加载 | 双源配置：`<script>` 注入 `window.PAW_*` 数组（兼容 `file://`）+ 同名 `.json` 由 `fetch` 优先读取；二者必须同步 |
| 资产路由 | `js/assetConfig.js` 统一接管所有图片路径：全部原创素材随仓库 `assets/` 公开部署（Cloudflare Pages 同源托管），`resolve()` 拼接 `assets/` 前缀 |
| 字体 | 自托管 4 款手写体（Caveat / Long Cang / Ma Shan Zheng / ZCOOL KuaiLe），SIL OFL 1.1 |
| 移动端保存 | `js/share-save.js`（`MobileSave`）：原生分享 → 下载 → 长按浮层兜底 |

核心模块：
- `js/app.js` —— 应用主控、视图路由、拍立得构建与记录
- `js/polaroid.js` —— 相纸叠加与裁剪合成
- `js/paperStyles.js` —— 相纸样式动态加载（双源）
- `js/wall.js` —— 展示墙布局与贴纸/图钉
- `js/timemachine.js` —— 时光机时间线
- `js/exporter.js` —— 回忆冲洗与图片导出
- `js/memory-store.js` —— `PawMemory` 统一数据模型
- `js/assetConfig.js` —— 资产路径统一路由（统一前缀 `assets/`）

---

## 🎨 Design Concept

> 用户不是“导出一张图片”，而是把一段和毛孩子相处的时光，“冲洗”成一份可以捧在手里的纪念品。

Pawlaroid 的叙事围绕**“冲洗仪式”**展开：快门闪光、相纸从模糊到清晰、元素聚合落位 ——
这些微交互把一次普通的“保存图片”包装成有温度的动作。视觉上采用暖米白胶片底色、
手写体留言、微倾斜的拍立得与和纸胶带，整体像一本手帐。

三大空间对应三种回忆姿态：
- **首页**：此刻，给毛孩子拍一张。
- **时光机**：回望，看它一点点长大的样子。
- **展示墙**：陈列，把好看的瞬间钉在一起。

所有原创视觉资产（相框 / 贴纸 / 背景 / 标题 / 首页主视觉）均随仓库公开，由 Cloudflare Pages 直接同源托管，
打开网页即可体验完整的宠物拍立得手帐体验，无需任何远程存储或占位降级。

---

## 📁 Project Structure

```
Pawlaroid/
├── index.html              # 单页应用入口
├── css/
│   ├── style.css           # 主样式
│   └── fonts.css           # 自托管字体 @font-face
├── js/
│   ├── assetConfig.js      # 资产路径统一路由（统一前缀 assets/）
│   ├── app.js              # 应用主控
│   ├── polaroid.js         # 相纸合成
│   ├── paperStyles.js      # 相纸动态加载
│   ├── wall.js             # 展示墙
│   ├── timemachine.js      # 时光机
│   ├── exporter.js         # 回忆冲洗 / 导出
│   ├── memory-store.js     # 统一数据模型
│   ├── share-save.js       # 移动端保存
│   ├── assets.js           # 视觉资产配置（标题图等）
│   ├── assets-export.js    # 导出用资源（背景 / 贴纸路径）
│   └── fonts/              # 自托管手写体（281 个 unicode-range 子集，OFL）
├── frames/                 # 相纸清单（全量元数据 frames.json[6] + file:// 兜底 frames.js）
├── stickers/               # 贴纸清单（全量元数据 stickers.json[9] + file:// 兜底 stickers.js）
├── pins/                   # 图钉（代码生成的 SVG）
├── assets/                 # 全部原创素材（WebP，随仓库公开，Cloudflare Pages 同源托管）
│   ├── frames/             #   6 款相纸二进制（600×600）
│   ├── stickers/           #   9 款贴纸二进制（320×320）
│   ├── backgrounds/        #   展示墙背景（wall-bg.webp）
│   ├── titles/             #   时光机标题图（time-machine-title.webp）
│   └── home/               #   首页主视觉 / 按钮（hero.webp / bone-cta.webp）
├── docs/
│   └── PROJECT_STORY.md    # 产品理念与设计思考
├── LICENSE                 # MIT（代码）/ OFL（字体）/ 资产说明
└── .gitignore
```

---

## 🗄 Asset Architecture（部署与资产策略）

Pawlaroid 采用 **「代码 + 视觉资产全部随仓库公开」** 的极简架构：

| 层 | 承载 | 内容 |
| --- | --- | --- |
| **GitHub**（本仓库） | 代码 + 配置 + 文档 + **全部原创素材** | HTML / CSS / JS、相框 / 贴纸 / 背景 / 标题 / 首页视觉（WebP 二进制） |
| **Cloudflare Pages** | 网站部署 | 由 GitHub 自动构建并全球分发，得到 `*.pages.dev` 公开访问地址，直接同源托管 `assets/` |

全部原创素材（6 款相框 / 9 款贴纸 / 展示墙背景 / 时光机标题 / 首页主视觉）均随仓库提交，
由 Cloudflare Pages 与页面同源托管，打开即玩、无远程依赖、无占位降级、无 404。

**新增素材**：把 WebP 放进 `assets/` 对应子目录，在 `frames/frames.json` 或 `stickers/stickers.json`
（及对应的 `frames/frames.js` / `stickers/stickers.js` 兜底）加一行即可，无需改动合成 / 展示墙 / 导出逻辑。

合成 / 展示墙 / 导出算法**不变**，所有图片经 `js/assetConfig.js` 的 `resolve()` 以相对路径（`assets/`）加载，同源不污染 canvas。

---

## 🎨 Asset License（资产许可）

The visual assets (including illustrations, stickers, and polaroid frames) are original works created for Pawlaroid.
They are included for demonstration purposes only.
Please do not redistribute or reuse these assets in other projects without permission.

中文说明：本项目的视觉资产（插画、贴纸、拍立得相框等）均为 Pawlaroid 原创设计，
随仓库附带仅作**演示与学习**之用。如需在其他项目中使用、转载或二次创作，请先获得作者授权。

- 相框：6 款原创相纸（WebP）。
- 贴纸：9 款原创贴纸（WebP）。
- 背景 / 标题图 / 首页主视觉：原创插画。
- 图钉：由代码生成 SVG，无外部原画依赖。
- 字体：Caveat / Long Cang / Ma Shan Zheng / ZCOOL KuaiLe，均 SIL OFL 1.1，可随仓库使用。

所有图片均经 `js/assetConfig.js` 以相对路径（`assets/`）加载。你可以按仓库结构替换为自己的素材
（相纸 / 贴纸通过 `frames/`、`stickers/` 配置即可扩展）。

---

## 📜 License

- **代码**（HTML / CSS / JavaScript / 文档）：[MIT](./LICENSE)
- **字体**：SIL Open Font License 1.1（见 [js/fonts/OFL.txt](./js/fonts/OFL.txt)）
- **视觉资产（相框 / 贴纸 / 背景 / 标题 / 首页插画）**：Pawlaroid 原创设计，随仓库附带仅作演示与学习；转载或商用须获作者授权（见上方 Asset License）

---

Made with 🐾 for every little companion.
