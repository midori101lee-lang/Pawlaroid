#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pawlaroid 素材提交服务（零依赖，仅标准库）。

网页端 tools/submit.html 把 PNG 在浏览器内转成 WebP，连同元数据 POST 到这里；
本服务负责：
  1) 把 WebP 落到 assets/<dir>/ 下（绝不留 PNG，避免被 .gitignore 忽略且保证同源）；
  2) 追加一条配置到对应 assets/config/<name>.json；
  3) 同步重生成 file:// 兜底脚本 assets/config/<name>.js；
  4) git add + commit（+ 默认 push 到 origin/main，触发 Cloudflare Pages 重新部署）。

运行：  python3 tools/submit-server.py            # 默认 :8731，自动 push
        PUSH=0 python3 tools/submit-server.py     # 只 commit 不 push
        python3 tools/submit-server.py --no-push  # 同上
        PORT=9000 python3 tools/submit-server.py  # 换端口
"""
import sys
import os
import re
import json
import base64
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # tools/ 的父目录 = 仓库根
PORT = int(os.environ.get("PORT", "8731"))
PUSH = os.environ.get("PUSH", "1") == "1"

# 命令行可覆盖 PUSH
if "--no-push" in sys.argv:
    PUSH = False

# 类别 -> 配置映射
#   json : 追加配置的 JSON 文件
#   dir  : WebP 落盘目录（相对仓库根）
#   js   : 需同步重生成的 file:// 兜底脚本
#   global : 兜底脚本里的全局变量名
CATS = {
    "sticker":   {"json": "assets/config/stickers.json", "dir": "assets/stickers",   "js": "assets/config/stickers.js", "global": "PAW_STICKERS"},
    "tape":      {"json": "assets/config/pins.json",     "dir": "assets/attachments","js": "assets/config/pins.js",    "global": "PAW_PINS"},
    "frame":     {"json": "assets/config/frames.json",   "dir": "assets/frames",     "js": "assets/config/frames.js",  "global": "PAW_FRAMES"},
    "background": {"json": "assets/config/themes.json",   "dir": "assets/backgrounds","js": "assets/config/themes.js",  "global": "PAW_WALL_THEMES"},
}


# ----------------------------------------------------------------------------
# 工具函数
# ----------------------------------------------------------------------------
def slug(s):
    s = (s or "asset").lower().strip()
    s = re.sub(r"[^\w\u4e00-\u9fa5]+", "_", s, flags=re.UNICODE)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "asset"


def gen_filename(directory, base, ext="webp"):
    d = os.path.join(ROOT, directory)
    os.makedirs(d, exist_ok=True)
    for _ in range(20):
        cand = "%s_%s.%s" % (slug(base), os.urandom(3).hex(), ext)
        if not os.path.exists(os.path.join(d, cand)):
            return cand
    return "%s_%s.%s" % (slug(base), os.urandom(6).hex(), ext)


def safe_name(n):
    """仅允许字母数字下划线横线，防目录穿越。"""
    return re.sub(r"[^A-Za-z0-9_\-]", "", n or "")


def load_json(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return []
    with open(p, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except Exception:
            data = []
    return data if isinstance(data, list) else []


def save_json(rel, data):
    p = os.path.join(ROOT, rel)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def save_js_array(rel, global_name, data):
    """通用兜底脚本：window.GLOBAL = [ ... ];"""
    p = os.path.join(ROOT, rel)
    with open(p, "w", encoding="utf-8") as f:
        f.write("/* 自动生成 — 与同名 .json 保持一致（提交系统同步）。请勿手改。 */\n")
        f.write("window.%s = " % global_name)
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")


def save_pins_js(rel, data):
    """pins.js 特殊格式：RAW 数组经 AttachmentFactory 生成 file（file:// 友好）。"""
    p = os.path.join(ROOT, rel)
    with open(p, "w", encoding="utf-8") as f:
        f.write("/* 固定件配置兜底（assets/config/pins.js）— file:// 友好注入。\n")
        f.write(" * 与 pins.json 内容需保持一致（提交系统会自动同步两者）。\n")
        f.write(" * 这里只描述「画什么」（参数），由 AttachmentFactory 负责「怎么画」。\n")
        f.write(" * 胶带(type:image) 直接带 file 字段（二进制 WebP），不进 SVG 生成器。 */\n")
        f.write("(function () {\n")
        f.write("    var RAW = ")
        json.dump(data, f, ensure_ascii=False, indent=4)
        f.write(";\n")
        f.write("    window.PAW_PINS = RAW.map(function (p) {\n")
        f.write("        var item = Object.assign({}, p);\n")
        f.write("        if (window.AttachmentFactory) item.file = window.AttachmentFactory.create(p);\n")
        f.write("        item.defaultSize = p.size;\n")
        f.write("        return item;\n")
        f.write("    });\n")
        f.write("})();\n")


# ----------------------------------------------------------------------------
# 配置条目构建
# ----------------------------------------------------------------------------
def build_entry(category, meta, rel_file):
    meta = meta or {}
    if category == "sticker":
        name = meta.get("name") or "新贴纸"
        eid = safe_name(meta.get("id")) or slug(name)
        return {
            "id": eid,
            "name": name,
            "image": rel_file,
            "type": "sticker",
            "defaultScale": float(meta.get("defaultScale", 1) or 1),
            "defaultRotation": int(meta.get("defaultRotation", 0) or 0),
            "defaultSize": int(meta.get("defaultSize", 96) or 96),
        }
    if category == "tape":
        name = meta.get("name") or "新胶带"
        eid = safe_name(meta.get("id")) or ("tape_" + slug(name))
        themes = meta.get("wallTheme") or ["felt"]
        if isinstance(themes, str):
            themes = [themes]
        return {
            "id": eid,
            "name": name,
            "type": "image",
            "attachmentType": "tape",
            "file": rel_file,
            "size": int(meta.get("size", 80) or 80),
            "wallTheme": themes,
        }
    if category == "frame":
        name = meta.get("name") or "新相纸"
        return {
            "name": name,
            "thumbnail": rel_file,
            "image": rel_file,
        }
    if category == "background":
        name = meta.get("name") or "新背景"
        theme_id = meta.get("theme") or "felt"
        eid = safe_name(meta.get("id")) or ("bg_" + slug(name))
        return {
            "id": eid,
            "name": name,
            "file": rel_file,
            "_theme": theme_id,  # 仅用于服务端定位主题，落盘前移除
            "_accent": meta.get("accent"),
        }
    raise ValueError("未知类别: %s" % category)


def apply_entry(category, cfg, entry, rel_file):
    """把条目写进对应 JSON，返回 (新数据列表, 被修改的 json 路径)。"""
    if category == "background":
        themes = load_json(cfg["json"])
        theme_id = entry.pop("_theme", "felt")
        accent = entry.pop("_accent", None)
        theme = next((t for t in themes if t.get("id") == theme_id), None)
        if not theme:
            raise ValueError("主题不存在: %s" % theme_id)
        base = (theme.get("variants") or [{}])[0]
        entry["overlay"] = entry.get("overlay") or base.get("overlay", "")
        entry["accent"] = accent or base.get("accent", "#888888")
        entry["titleColor"] = entry.get("titleColor") or base.get("titleColor", "#333333")
        theme.setdefault("variants", []).append(entry)
        save_json(cfg["json"], themes)
        return themes, cfg["json"]

    data = load_json(cfg["json"])
    data.append(entry)
    save_json(cfg["json"], data)
    return data, cfg["json"]


def regenerate_js(category, cfg, data):
    if category == "tape":  # tape 也走 pins.json -> pins.js 特殊格式
        save_pins_js(cfg["js"], data)
    elif category == "background":
        save_js_array(cfg["js"], cfg["global"], data)
    else:
        save_js_array(cfg["js"], cfg["global"], data)


# ----------------------------------------------------------------------------
# git
# ----------------------------------------------------------------------------
def git(*args):
    return subprocess.run(
        ["git", "-C", ROOT] + list(args),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )


def git_commit(files, message):
    git("add", *files)
    r = git("commit", "-m", message)
    if r.returncode != 0:
        raise RuntimeError("git commit 失败: " + (r.stderr or r.stdout))
    sha = git("rev-parse", "HEAD").stdout.strip()
    pushed = False
    if PUSH:
        p = git("push")
        pushed = p.returncode == 0
        if not pushed:
            raise RuntimeError("git push 失败: " + (p.stderr or p.stdout))
    return sha, pushed


# ----------------------------------------------------------------------------
# 处理一次提交
# ----------------------------------------------------------------------------
def process_submission(payload):
    category = payload.get("category")
    if category not in CATS:
        raise ValueError("不支持的类别: %s" % category)
    items = payload.get("items") or []
    if not items:
        raise ValueError("没有提交任何素材")

    cfg = CATS[category]
    dir_rel = cfg["dir"]
    added = []
    changed_files = []

    for it in items:
        raw = it.get("webp") or it.get("data")
        if not raw:
            raise ValueError("缺少 webp 数据")
        # 去掉 data URI 前缀
        if "," in raw and raw.strip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        try:
            blob = base64.b64decode(raw)
        except Exception:
            raise ValueError("webp 数据无法解码（需 base64）")
        if not blob[:4] == b"RIFF" or not blob[8:12] == b"WEBP":
            # 允许 png 兜底？不——必须 webp。给出友好提示。
            raise ValueError("提交的文件不是 WebP（前导字节校验失败）。请在网页端完成 PNG→WebP 转换后再提交。")

        meta = it.get("meta") or {}
        base_name = (meta.get("name") or it.get("name") or "asset")
        fname = gen_filename(dir_rel, base_name)
        out_path = os.path.join(ROOT, dir_rel, fname)
        with open(out_path, "wb") as f:
            f.write(blob)

        rel_file = "%s/%s" % (dir_rel.replace("assets/", ""), fname)
        entry = build_entry(category, meta, rel_file)
        data, json_path = apply_entry(category, cfg, entry, rel_file)
        regenerate_js(category, cfg, data)

        changed_files = sorted(set([json_path, cfg["js"], os.path.join(dir_rel, fname)]))
        added.append({"file": rel_file, "name": entry.get("name"), "id": entry.get("id")})

    # 全部写完后统一 git
    sha, pushed = git_commit(
        changed_files,
        "feat(assets): 提交新素材 via submit-tool — %s x%d" % (category, len(added))
    )
    return {"added": added, "commit": sha, "pushed": pushed, "files": changed_files}


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, *a):
        pass  # 静默

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/submit.html", "/index.html"):
            self._serve_file(os.path.join(ROOT, "tools", "submit.html"), "text/html; charset=utf-8")
        elif self.path == "/api/status":
            self._json(200, {"ok": True, "root": ROOT, "push": PUSH,
                             "counts": {c: len(load_json(CATS[c]["json"])) for c in CATS}})
        else:
            self.send_response(404)
            self._cors()
            self.end_headers()
            self.wfile.write(b"not found")

    def do_POST(self):
        if self.path != "/submit":
            self.send_response(404); self._cors(); self.end_headers(); return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            payload = json.loads(body.decode("utf-8"))
            result = process_submission(payload)
            self._json(200, {"ok": True, **result})
        except Exception as e:
            self._json(400, {"ok": False, "error": str(e)})

    def _serve_file(self, path, ctype):
        if not os.path.exists(path):
            self.send_response(404); self._cors(); self.end_headers(); return
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)


def main():
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Pawlaroid 素材提交服务已启动: http://localhost:%d" % PORT)
    print("  仓库根: %s" % ROOT)
    print("  自动 push: %s" % ("是" if PUSH else "否"))
    print("  打开 http://localhost:%d/ 提交素材，Ctrl+C 退出。" % PORT)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
