"""Make web-sized photos from the originals.

Reads photos/originals/<id>.jpg and writes, for each photo:
  public/images/<id>-<width>.webp   (480, 800, 1200, 1600 and, if large enough, 1920 px wide)
plus 1200×630 social previews (public/images/og.jpg and og-<id>.jpg) and src/data/photos.generated.json
(sizes for width/height attributes, so the layout never jumps while images load).

Run after adding or replacing an original:  python scripts/build_images.py
"""
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "photos" / "originals"
OUT = ROOT / "public" / "images"
META = ROOT / "src" / "data" / "photos.generated.json"
WIDTHS = [480, 800, 1200, 1600, 1920]
OG_SOURCE = "passu"


def social(src: Path, dest: Path) -> None:
    """1200×630 JPEG for link previews (social sites handle JPEG best)."""
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    ImageOps.fit(im, (1200, 630), Image.LANCZOS, centering=(0.5, 0.45)).save(
        dest, "JPEG", quality=78, optimize=True, progressive=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for path in sorted(SRC.glob("*.jpg")):
        pid = path.stem
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        w, h = im.size
        made = []
        for target in WIDTHS:
            if target > w:
                continue
            copy = im.resize((target, round(h * target / w)), Image.LANCZOS) if target < w else im
            quality = 72 if target <= 800 else (64 if target <= 1200 else 58)   # big files hide artefacts well
            copy.save(OUT / f"{pid}-{target}.webp", "WEBP", quality=quality, method=6)
            made.append(target)
        meta[pid] = {"width": w, "height": h, "widths": made}
        print(f"{pid}: {w}x{h} -> {made}")

    for path in sorted(SRC.glob("*.jpg")):
        social(path, OUT / f"og-{path.stem}.jpg")
    social(SRC / f"{OG_SOURCE}.jpg", OUT / "og.jpg")
    META.parent.mkdir(parents=True, exist_ok=True)
    META.write_text(json.dumps(meta, indent=1) + "\n")


if __name__ == "__main__":
    main()
