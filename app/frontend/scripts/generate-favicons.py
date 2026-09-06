#!/usr/bin/env python
"""
Regenerate every favicon variant from public/brand/logo-luna-250.png.

Run this whenever the brand mark changes:
    python scripts/generate-favicons.py

Emits, into public/:
    favicon.ico              (multi-size 16/32/48, phoenix on white)
    favicon-16x16.png        (browser tab, small)
    favicon-32x32.png        (browser tab, retina)
    apple-touch-icon.png     (180x180, phoenix on navy — iOS home screen)
    android-chrome-192x192.png / 512x512.png  (Android + PWA install)

Strategy: crop the top 60% of the source (phoenix + tracker mark, no
wordmark — text isn't legible at 16px), trim the near-white bounding
box so the mark fills the frame, then rebuild each variant with the
right padding and background.
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / 'public' / 'brand' / 'logo-luna-250.png'
OUT  = ROOT / 'public'

NAVY  = (0, 47, 103, 255)   # --luna-navy-deep
WHITE = (255, 255, 255, 255)


def bbox_nonwhite(img, thresh=245):
    """Bounding box of pixels darker than `thresh` in any RGB channel."""
    px = img.load()
    w, h = img.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if not (r >= thresh and g >= thresh and b >= thresh):
                xs.append(x)
                ys.append(y)
    if not xs:
        return (0, 0, w, h)
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def main():
    im = Image.open(SRC).convert('RGBA')
    w, h = im.size
    print(f'source: {w}x{h}')

    top = im.crop((0, 0, w, int(h * 0.60)))
    bx = bbox_nonwhite(top)
    mark = top.crop(bx)
    mw, mh = mark.size

    side = int(max(mw, mh) * 1.24)     # 12% margin all around
    on_navy  = Image.new('RGBA', (side, side), NAVY)
    on_white = Image.new('RGBA', (side, side), WHITE)
    on_navy .paste(mark, ((side - mw) // 2, (side - mh) // 2), mark)
    on_white.paste(mark, ((side - mw) // 2, (side - mh) // 2), mark)

    def emit(canvas, size, name):
        out = canvas.resize((size, size), Image.LANCZOS)
        out.save(OUT / name, optimize=True)
        print(f'  wrote {name} ({size}x{size})')
        return out

    img16 = emit(on_white, 16,  'favicon-16x16.png')
    img32 = emit(on_white, 32,  'favicon-32x32.png')
    img48 = on_white.resize((48, 48), Image.LANCZOS)
    img32.save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    print('  wrote favicon.ico (multi-size 16/32/48)')

    emit(on_navy, 180, 'apple-touch-icon.png')
    emit(on_navy, 192, 'android-chrome-192x192.png')
    emit(on_navy, 512, 'android-chrome-512x512.png')


if __name__ == '__main__':
    main()
