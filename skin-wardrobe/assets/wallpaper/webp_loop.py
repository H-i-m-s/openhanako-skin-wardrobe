"""
帧序列 → 溶解循环 → animated WebP（+ poster 首帧）。

这是 App 内置资产（assets/wallpaper/），后端 /wallpaper/from-video 与
仓库 CLI（scripts/wallpaper/）共用这一份。不要再复制出第二份。

用法:
  python webp_loop.py <frames_dir> <out.webp> <out.jpg> [dissolve=8] [quality=42] [fps=10]

做法：取 frames_dir 里 f*.png（按名排序），末尾追加 K 帧溶解（末帧 → 首帧），
循环回放无跳变。HUD / 持续演化类画面用溶解最稳；天然周期类素材可传 dissolve=0。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def main() -> None:
    args = sys.argv[1:]
    if len(args) < 3:
        raise SystemExit("用法: python webp_loop.py <frames_dir> <out.webp> <out.jpg> [dissolve=8] [quality=42] [fps=10]")
    frames_dir, out_webp, out_poster = args[0], args[1], args[2]
    k = int(args[3]) if len(args) > 3 else 8
    quality = int(args[4]) if len(args) > 4 else 42
    fps = int(args[5]) if len(args) > 5 else 10

    files = sorted(Path(frames_dir).glob("f*.png"))
    if len(files) < 2:
        raise SystemExit("帧太少：" + frames_dir)
    frames = [Image.open(f).convert("RGB") for f in files]
    first, last = frames[0], frames[-1]

    seq = list(frames)
    if k > 0:
        for j in range(1, k + 1):
            seq.append(Image.blend(last, first, j / k))

    duration = round(1000 / fps)
    seq[0].save(out_webp, save_all=True, append_images=seq[1:],
                duration=duration, loop=0, quality=quality, method=4)
    frames[0].save(out_poster, quality=86, optimize=True)

    print(f"frames={len(seq)}  webp={Path(out_webp).stat().st_size/1024:.0f} KB  "
          f"poster={Path(out_poster).stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
