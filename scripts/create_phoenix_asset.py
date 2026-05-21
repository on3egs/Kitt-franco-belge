#!/usr/bin/env python3
"""Generate a transparent fire phoenix asset for Kyronex Studio."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


PROJECT_DIR = Path(__file__).resolve().parent.parent
ASSET_DIR = PROJECT_DIR / "assets"
OUT = ASSET_DIR / "phoenix_fire.png"


def flame_line(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], color: tuple[int, int, int, int], width: int) -> None:
    draw.line(points, fill=color, width=width, joint="curve")


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    width, height = 360, 220
    base = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)

    cx, cy = width // 2, 118
    red = (255, 24, 42, 92)
    orange = (255, 112, 20, 115)
    yellow = (255, 218, 85, 135)
    ember = (180, 0, 20, 70)

    # Outer wings and tail glow.
    left_wing = [(cx, cy), (126, 78), (54, 24), (91, 96), (28, 134), (112, 132), (68, 188), (146, 154)]
    right_wing = [(cx, cy), (234, 78), (306, 24), (269, 96), (332, 134), (248, 132), (292, 188), (214, 154)]
    tail = [(cx, cy + 18), (150, 166), (128, 214), (178, 176), (180, 220), (202, 176), (232, 214), (210, 166)]

    gd.polygon(left_wing, fill=red)
    gd.polygon(right_wing, fill=red)
    gd.polygon(tail, fill=ember)
    gd.ellipse((154, 72, 206, 136), fill=(255, 80, 24, 90))
    gd.ellipse((174, 48, 200, 78), fill=(255, 180, 60, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    base.alpha_composite(glow)

    d = ImageDraw.Draw(base)

    # Feather flame strokes.
    for offset, color, line_width in ((0, red, 8), (8, orange, 6), (15, yellow, 3)):
        flame_line(d, [(cx, cy), (126, 82 + offset), (70, 42 + offset), (92, 94 + offset), (42, 128 + offset)], color, line_width)
        flame_line(d, [(cx, cy), (234, 82 + offset), (290, 42 + offset), (268, 94 + offset), (318, 128 + offset)], color, line_width)
        flame_line(d, [(cx - 4, cy + 8), (128, 136 + offset), (78, 180), (148, 154)], color, max(2, line_width - 1))
        flame_line(d, [(cx + 4, cy + 8), (232, 136 + offset), (282, 180), (212, 154)], color, max(2, line_width - 1))

    # Body, head and crown.
    d.ellipse((159, 78, 201, 138), fill=(255, 72, 32, 160))
    d.ellipse((171, 58, 198, 86), fill=(255, 150, 45, 170))
    d.polygon([(193, 66), (224, 56), (202, 78)], fill=(255, 198, 72, 150))
    d.polygon([(178, 60), (170, 32), (188, 56), (205, 34), (196, 62)], fill=(255, 42, 48, 140))
    d.line([(180, 90), (172, 140), (142, 196)], fill=(255, 190, 70, 120), width=4)
    d.line([(188, 92), (190, 146), (214, 205)], fill=(255, 190, 70, 120), width=4)

    # Subtle ember particles.
    for x, y, r, a in (
        (64, 64, 2, 95), (92, 34, 3, 80), (300, 70, 2, 95), (268, 32, 3, 80),
        (48, 170, 2, 70), (318, 170, 2, 70), (132, 204, 2, 75), (234, 204, 2, 75),
    ):
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 120, 35, a))

    base = base.resize((250, 153), Image.Resampling.LANCZOS)
    base.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
