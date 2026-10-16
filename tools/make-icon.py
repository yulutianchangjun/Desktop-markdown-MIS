"""生成应用图标源图（1024x1024 PNG），再交由 `tauri icon` 派生各平台尺寸。"""

from PIL import Image, ImageDraw

SIZE = 1024
BG_TOP = (18, 20, 24)
BG_BOTTOM = (6, 7, 9)
ACCENT = (74, 158, 255)
ACCENT_SOFT = (74, 158, 255, 46)


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=255)
    return mask


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # 垂直渐变底：从上到下逐行插值，再整体套圆角遮罩。
    gradient = Image.new("RGBA", (SIZE, SIZE))
    draw = ImageDraw.Draw(gradient)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        color = tuple(
            round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)
        ) + (255,)
        draw.line([(0, y), (SIZE, y)], fill=color)

    img.paste(gradient, (0, 0), rounded_mask(SIZE, 224))

    draw = ImageDraw.Draw(img, "RGBA")

    # 1px 微发光边框，与应用内的卡片描边语言一致。
    draw.rounded_rectangle(
        (16, 16, SIZE - 17, SIZE - 17), 212, outline=(255, 255, 255, 26), width=3
    )

    # 文档轮廓
    doc = (300, 236, 724, 788)
    draw.rounded_rectangle(doc, 44, fill=(255, 255, 255, 10), outline=(255, 255, 255, 40), width=6)

    # 折角
    fold = [(596, 236), (724, 364), (596, 364)]
    draw.polygon(fold, fill=(255, 255, 255, 34))
    draw.line([(596, 236), (596, 364), (724, 364)], fill=(255, 255, 255, 70), width=6)

    # Markdown 下箭头：导入 / 落库的语义
    draw.line([(512, 420), (512, 596)], fill=ACCENT, width=34)
    draw.polygon([(512, 676), (426, 566), (598, 566)], fill=ACCENT)

    # 基线
    draw.line([(382, 704), (642, 704)], fill=(255, 255, 255, 60), width=18)

    # 强调色光晕
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((256, 300, 768, 812), fill=ACCENT_SOFT)
    img.alpha_composite(glow)
    img.alpha_composite(
        Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)),
    )

    # 重绘前景，保证光晕不糊掉线条
    draw = ImageDraw.Draw(img, "RGBA")
    draw.line([(512, 420), (512, 596)], fill=ACCENT, width=34)
    draw.polygon([(512, 676), (426, 566), (598, 566)], fill=ACCENT)
    draw.line([(382, 704), (642, 704)], fill=(255, 255, 255, 60), width=18)

    img.save("src-tauri/icons/source.png")
    print("wrote src-tauri/icons/source.png", img.size)


if __name__ == "__main__":
    main()
