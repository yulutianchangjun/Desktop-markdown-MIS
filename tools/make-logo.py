"""把提供的黑白几何 Logo 裁成适合做应用图标的方形图。

原图是 1254x1254 的黑线稿 + 米白底（无透明通道），四周留白很大。直接拿去生成
图标会让标记在 16x16 里几乎看不见，所以这里：

  1. 以四角像素判定底色；
  2. 找出与底色有明显差异的像素包围盒（也就是标记本身）；
  3. 以包围盒为准扩成正方形，外加统一留白；
  4. 重采样到 1024x1024（Tauri 官方建议的图标源尺寸）。

输出 src/assets/logo.png；原始大图另存 src/assets/logo-source.png 备查。

    python tools/make-logo.py [--source <原图>]
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "assets"
DEFAULT_SOURCE = Path(
    r"E:\OnlyMyDemo\2026.10.17Md-Mis功能完善.assets"
    r"\黑白几何 D 中嵌 M 标志-1792218421029-4.png"
)

OUT_SIZE = 1024
MARGIN_RATIO = 0.06  # 四周留白占最终边长的比例


def main() -> int:
    parser = argparse.ArgumentParser(description="裁剪 Md-Mis Logo 并生成图标源图")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()

    src: Path = args.source
    if not src.exists():
        print(f"找不到原图：{src}", file=sys.stderr)
        return 1

    ASSETS.mkdir(parents=True, exist_ok=True)

    img = Image.open(src).convert("RGB")
    w, h = img.size
    px = img.load()

    # 1) 底色取四角平均值
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // len(corners) for i in range(3))

    # 2) 找标记的包围盒（与底色差异超过阈值）
    threshold = 40

    def is_ink(p: tuple[int, int, int]) -> bool:
        return max(abs(p[0] - bg[0]), abs(p[1] - bg[1]), abs(p[2] - bg[2])) > threshold

    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if is_ink(px[x, y]):
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y

    if max_x < 0:
        print("没能识别出标记内容（整张图都接近底色）", file=sys.stderr)
        return 1

    ink_w = max_x - min_x + 1
    ink_h = max_y - min_y + 1
    side = max(ink_w, ink_h)
    side_with_margin = round(side / (1 - 2 * MARGIN_RATIO))

    cx = (min_x + max_x) // 2
    cy = (min_y + max_y) // 2
    half = side_with_margin // 2
    left, top = cx - half, cy - half

    canvas = Image.new("RGB", (side_with_margin, side_with_margin), bg)
    canvas.paste(img, (-left, -top))

    out = canvas.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    out_path = ASSETS / "logo.png"
    out.save(out_path, optimize=True)

    # 原始大图一并入库，方便以后换尺寸重生成
    shutil.copyfile(src, ASSETS / "logo-source.png")

    print(f"原图   : {src}  ({w}x{h})")
    print(f"底色   : rgb{bg}")
    print(f"标记框 : ({min_x},{min_y})-({max_x},{max_y})  即 {ink_w}x{ink_h}")
    print(f"输出   : {out_path}  ({OUT_SIZE}x{OUT_SIZE}, {out_path.stat().st_size // 1024} KB)")
    print(f"备份   : {ASSETS / 'logo-source.png'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
