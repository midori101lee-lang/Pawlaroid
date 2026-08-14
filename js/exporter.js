/* ============================================================
   exporter.js — 已拆分（2026-08-14）
   ------------------------------------------------------------
   原单体（DevelopAnimation + Exporter._renderWallToCanvas /
   _drawWallItem / exportWall / exportTimeMachine / _renderTimelineToCanvas
   等）已按职责拆分为：

     js/export/export-manager.js  → ExportShared（共享工具）+
                                     DevelopAnimation（冲洗仪式）+
                                     ExportManager（导出菜单）
     js/export/diary-export.js    → Exporter（4:5 纪念长图 + 时光机长图）
     js/export/wall-export.js     → WallExport（忠实裸墙 PNG）

   本文件保留为空壳注释，避免经典 <script> 顶层 const
   （DevelopAnimation / Exporter）重复声明导致 SyntaxError。
   调用入口：index.html 的「🧸 导出回忆」按钮 → ExportManager.openMenu()。
   ============================================================ */
