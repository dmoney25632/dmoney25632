"""Turn a logo into crisp pixel art using half-blocks (assets/ascii.txt).
   python scripts/make_pixel.py assets/f42-logo.jpg [cols] [threshold]
Dark logo pixels on a light background become filled blocks."""
import sys
from PIL import Image, ImageOps

src, cols = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 60
thr = int(sys.argv[3]) if len(sys.argv) > 3 else 128
img = ImageOps.invert(Image.open(src).convert("L"))
img = img.crop(img.point(lambda v: 255 if v > thr else 0).getbbox())  # trim whitespace
w, h = img.size
rows = round(cols * h / w * 0.5) * 2          # 2 pixel rows per text row
img = img.resize((cols, rows), Image.LANCZOS)
px = img.load()
on = lambda x, y: px[x, y] > thr
out = []
for y in range(0, rows, 2):
    out.append("".join(
        "█" if on(x, y) and on(x, y + 1) else "▀" if on(x, y) else "▄" if on(x, y + 1) else " "
        for x in range(cols)).rstrip())
open("assets/ascii.txt", "w").write("\n".join(out) + "\n")
print("\n".join(out))
