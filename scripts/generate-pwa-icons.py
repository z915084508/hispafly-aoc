"""Generate installation assets from the existing official HISPAFLY emblem.

Development-only: Python 3 + Pillow. No network, new artwork or runtime dependency.
The emblem occupies the left 430x400 region of the committed 1800x400 logo.
Keep the complete emblem inside a 60% square for the maskable safe circle.
Run from the repository root: python scripts/generate-pwa-icons.py
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / "public/logo-hispafly-full.png").convert("RGBA")
assert source.size == (1800, 400), "Review emblem crop if the official logo changes"
emblem = source.crop((0, 0, 430, 400))
emblem = emblem.crop(emblem.getbbox())
icons = root / "public/icons"
icons.mkdir(exist_ok=True)


def icon(size, fraction=0.8):
    canvas = Image.new("RGBA", (size, size), "#f5f7fb")
    mark = emblem.copy()
    mark.thumbnail((round(size * fraction), round(size * fraction)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas.convert("RGB")


icon(192).save(icons / "icon-192.png")
icon(512).save(icons / "icon-512.png")
icon(512, 0.6).save(icons / "icon-maskable-512.png")
icon(180).save(icons / "apple-touch-icon.png")
icon(48).save(root / "public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("Generated official-emblem PWA icons, Apple Touch Icon and favicon.")
