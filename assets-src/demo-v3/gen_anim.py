"""
生成演示用动图背景（animated WebP）+ poster。

两套：dark（近黑底 + 缓慢漂移的玫瑰色光斑）、light（暖纸底 + 同族浅色光斑）。
循环无缝：所有位移用 sin/cos 走完整周期。
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W, H = 960, 540
FRAMES = 36
DURATION_MS = 83  # ≈ 12fps，36 帧 ≈ 3 秒一个循环

OUT = Path(__file__).resolve().parent


def render(dark: bool) -> list[Image.Image]:
    base_rgb = (20, 19, 19) if dark else (246, 243, 236)
    # 光斑颜色：暗色偏玫瑰，亮色偏暖赭，都压得很低饱和
    blobs = [
        {"color": (205, 91, 133) if dark else (200, 130, 150), "r": 210, "cx": 0.30, "cy": 0.34, "amp": 0.10, "phase": 0.0},
        {"color": (120, 140, 200) if dark else (150, 165, 205), "r": 260, "cx": 0.70, "cy": 0.62, "amp": 0.12, "phase": 2.1},
        {"color": (220, 180, 120) if dark else (225, 190, 140), "r": 170, "cx": 0.52, "cy": 0.78, "amp": 0.08, "phase": 4.2},
    ]
    alpha = 90 if dark else 70  # 光斑层不透明度（0-255）

    frames: list[Image.Image] = []
    for i in range(FRAMES):
        t = i / FRAMES
        angle = t * 2 * math.pi

        base = Image.new("RGB", (W, H), base_rgb)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)

        for b in blobs:
            cx = (b["cx"] + b["amp"] * math.cos(angle + b["phase"])) * W
            cy = (b["cy"] + b["amp"] * math.sin(angle + b["phase"]) * 0.7) * H
            r = b["r"] * (0.92 + 0.08 * math.sin(angle * 2 + b["phase"]))
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=b["color"] + (alpha,))

        layer = layer.filter(ImageFilter.GaussianBlur(70))
        frame = Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")

        # 轻微暗角，避免光斑把画面压平
        vig = Image.new("L", (W, H), 0)
        dv = ImageDraw.Draw(vig)
        dv.ellipse([-W * 0.25, -H * 0.35, W * 1.25, H * 1.35], fill=255)
        vig = vig.filter(ImageFilter.GaussianBlur(120))
        if dark:
            frame = Image.composite(frame, Image.new("RGB", (W, H), (10, 9, 9)), vig)
        else:
            frame = Image.composite(frame, Image.new("RGB", (W, H), (228, 224, 214)), vig)

        frames.append(frame)
    return frames


def main() -> None:
    for name, dark in (("demo-dark", True), ("demo-light", False)):
        frames = render(dark)
        webp = OUT / f"{name}.webp"
        poster = OUT / f"{name}-poster.jpg"

        frames[0].save(
            webp,
            save_all=True,
            append_images=frames[1:],
            duration=DURATION_MS,
            loop=0,
            quality=72,
            method=4,
        )
        frames[0].save(poster, quality=86, optimize=True)

        print(f"{webp.name}: {webp.stat().st_size / 1024:.0f} KB")
        print(f"{poster.name}: {poster.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
