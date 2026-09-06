#!/usr/bin/env python
"""
Regenerate every favicon variant from public/brand/logo-luna-250.png.

Run this whenever the brand mark changes:
    python scripts/generate-favicons.py

Emits, into public/:
    favicon.ico                    multi-size 16/32/48, light variant (legacy fallback)
    favicon-16x16.png              tab bar, LIGHT theme  (blue phoenix on transparent)
    favicon-32x32.png              tab bar retina, LIGHT theme
    favicon-16x16-dark.png         tab bar, DARK theme   (near-white phoenix on transparent)
    favicon-32x32-dark.png         tab bar retina, DARK theme
    apple-touch-icon.png           180x180, phoenix on navy (iOS home screen)
    android-chrome-192x192.png     Android + PWA install icon
    android-chrome-512x512.png     PWA splash / high-res

Strategy: crop the top 60% of the source (just the phoenix + tracker
mark — the wordmark isn't legible under ~48px), fade near-white pixels
to transparent so we get a real alpha channel, then build each variant.
For the dark-theme tab favicon we recolour the mark toward near-white
while preserving its luminosity so the shape stays recognisable.
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / 'public' / 'brand' / 'logo-luna-250.png'
OUT  = ROOT / 'public'

NAVY = (0, 47, 103, 255)   # --luna-navy-deep


def phoenix_with_alpha(im):
    """Crop the phoenix mark from the source and turn near-white pixels
    transparent so we can composite it on any background (or ship it as-is
    on transparent for light/dark tab favicons)."""
    w, h = im.size
    top = im.crop((0, 0, w, int(h * 0.60))).convert('RGBA')
    px = top.load()
    tw, th = top.size
    for y in range(th):
        for x in range(tw):
            r, g, b, a = px[x, y]
            m = min(r, g, b)
            if m >= 245:
                px[x, y] = (0, 0, 0, 0)
            elif m >= 220:                              # feather edges
                px[x, y] = (r, g, b, int((245 - m) * (255 / 25)))
    alpha = top.split()[3]
    return top.crop(alpha.getbbox())


def recolour_light(mark):
    """Return a near-white recolour of `mark` (dark-theme variant).
    Preserves luminosity so the phoenix keeps its shape at a glance."""
    out = mark.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = int(0.299 * r + 0.587 * g + 0.114 * b)
            v = 200 + (55 * (255 - lum)) // 255         # 200..255
            px[x, y] = (v, v, v, a)
    return out


def framed(mark, bg_rgba):
    """Pad mark into a square with a 12% margin and the given background."""
    mw, mh = mark.size
    side = int(max(mw, mh) * 1.24)
    canvas = Image.new('RGBA', (side, side), bg_rgba)
    canvas.paste(mark, ((side - mw) // 2, (side - mh) // 2), mark)
    return canvas


def main():
    im = Image.open(SRC).convert('RGBA')
    print(f'source: {im.size[0]}x{im.size[1]}')

    mark_light = phoenix_with_alpha(im)                 # blue phoenix, transparent
    mark_dark  = recolour_light(mark_light)             # white phoenix, transparent

    on_transparent_light = framed(mark_light, (0, 0, 0, 0))
    on_transparent_dark  = framed(mark_dark,  (0, 0, 0, 0))
    on_navy_light        = framed(mark_light, NAVY)

    def emit(canvas, size, name):
        out = canvas.resize((size, size), Image.LANCZOS)
        out.save(OUT / name, optimize=True)
        print(f'  wrote {name} ({size}x{size})')
        return out

    # Tab bar (theme-aware, transparent bg — the browser paints its own).
    emit(on_transparent_light, 16, 'favicon-16x16.png')
    emit(on_transparent_light, 32, 'favicon-32x32.png')
    emit(on_transparent_dark,  16, 'favicon-16x16-dark.png')
    emit(on_transparent_dark,  32, 'favicon-32x32-dark.png')

    # .ico multi-size — light variant only (legacy fallback for tools that
    # ignore <link media>).
    ico = on_transparent_light.resize((32, 32), Image.LANCZOS)
    ico.save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    print('  wrote favicon.ico (multi-size 16/32/48, light)')

    # iOS + Android — solid brand navy (Apple rejects transparency).
    emit(on_navy_light, 180, 'apple-touch-icon.png')
    emit(on_navy_light, 192, 'android-chrome-192x192.png')
    emit(on_navy_light, 512, 'android-chrome-512x512.png')


if __name__ == '__main__':
    main()
