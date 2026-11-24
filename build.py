"""Gera as versões de arquivo único do Vulpes Financeiro a partir de src/.

  dist/vulpes-financeiro.html  documento completo: abra direto no navegador (dados salvos no navegador)
  dist/artifact.html           conteúdo para publicação como Artifact no claude.ai (dados salvos na conta)
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

index = (SRC / "index.html").read_text(encoding="utf-8")
head = (SRC / "head.html").read_text(encoding="utf-8").strip()
css = (SRC / "styles.css").read_text(encoding="utf-8")
scripts = re.findall(r'<script src="(js/[^"]+)"></script>', index)
js = "\n".join((SRC / s).read_text(encoding="utf-8") for s in scripts).replace("</script", "<\\/script")

body = f'{head}\n<style>\n{css}\n</style>\n<div id="app"></div>\n<script>\n{js}\n</script>\n'
DIST.mkdir(exist_ok=True)
(DIST / "artifact.html").write_text(body, encoding="utf-8")
full = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f'{head}\n<style>\n{css}\n</style>\n</head>\n<body>\n<div id="app"></div>\n<script>\n{js}\n</script>\n</body>\n</html>\n')
(DIST / "vulpes-financeiro.html").write_text(full, encoding="utf-8")
print("ok:", len(scripts), "scripts,", len(full) // 1024, "KB")
