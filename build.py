"""Gera as versões de arquivo único do Vulpes Financeiro a partir de src/.

  dist/web/index.html          versão web (Vercel): login das sócias e dados no Supabase
  dist/vulpes-financeiro.html  documento completo: abra direto no navegador (dados salvos no navegador)
  dist/artifact.html           conteúdo para publicação como Artifact no claude.ai (dados salvos na conta)

Scripts marcados com data-web no src/index.html (Supabase, configuração e login) só entram na versão web.
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

index = (SRC / "index.html").read_text(encoding="utf-8")
head = (SRC / "head.html").read_text(encoding="utf-8").strip()
css = (SRC / "styles.css").read_text(encoding="utf-8")
tags = re.findall(r'<script( data-web)? src="((?:js|vendor)/[^"]+)"></script>', index)


def bundle(include_web):
    files = [src for web, src in tags if include_web or not web]
    js = "\n".join((SRC / s).read_text(encoding="utf-8") for s in files).replace("</script", "<\\/script")
    return files, js


def page(js, extra_head=""):
    return ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'{extra_head}{head}\n<style>\n{css}\n</style>\n</head>\n<body>\n<div id="app"></div>\n<script>\n{js}\n</script>\n</body>\n</html>\n')


DIST.mkdir(exist_ok=True)
files, js = bundle(include_web=False)
(DIST / "artifact.html").write_text(f'{head}\n<style>\n{css}\n</style>\n<div id="app"></div>\n<script>\n{js}\n</script>\n', encoding="utf-8")
(DIST / "vulpes-financeiro.html").write_text(page(js), encoding="utf-8")

web_files, web_js = bundle(include_web=True)
(DIST / "web").mkdir(exist_ok=True)
web = page(web_js, '<meta name="robots" content="noindex, nofollow">\n')
(DIST / "web" / "index.html").write_text(web, encoding="utf-8")
print("ok:", len(files), "scripts (claude/offline),", len(web_files), "scripts (web),", len(web) // 1024, "KB web")
