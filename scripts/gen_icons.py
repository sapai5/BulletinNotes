#!/usr/bin/env python3
"""Generate PWA icons with no third-party dependencies (stdlib only).

Draws a rounded slate tile with an amber sticky note and a red pin dot.
Outputs public/pwa-192x192.png, public/pwa-512x512.png, public/apple-touch-icon.png.
"""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), "public")

SLATE = (30, 41, 59)      # #1e293b
AMBER = (250, 204, 21)    # #facc15
RED = (239, 68, 68)       # #ef4444
STRING = (148, 163, 184)  # pin stem


def blend(bg, fg, a):
    return tuple(int(bg[i] * (1 - a) + fg[i] * a) for i in range(3))


def rounded_rect_alpha(px, py, x0, y0, x1, y1, r):
    """Return coverage 0..1 for a rounded rect (simple AA via distance)."""
    if px < x0 or px > x1 or py < y0 or py > y1:
        return 0.0
    # corners
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    dx = px - cx
    dy = py - cy
    dist = (dx * dx + dy * dy) ** 0.5
    if dist <= r - 1:
        return 1.0
    if dist >= r + 1:
        return 0.0 if (dx or dy) else 1.0
    return max(0.0, min(1.0, (r - dist + 1) / 2))


def circle_alpha(px, py, cx, cy, r):
    dist = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
    if dist <= r - 1:
        return 1.0
    if dist >= r + 1:
        return 0.0
    return max(0.0, min(1.0, (r - dist + 1) / 2))


def make_icon(size):
    s = size
    pixels = bytearray()
    note_x0, note_y0 = s * 0.22, s * 0.28
    note_x1, note_y1 = s * 0.78, s * 0.82
    tile_r = s * 0.18
    note_r = s * 0.04
    pin_cx, pin_cy, pin_r = s * 0.5, s * 0.24, s * 0.075

    for y in range(s):
        row = bytearray()
        for x in range(s):
            # base transparent
            color = (0, 0, 0)
            alpha = 0.0
            # slate tile
            ta = rounded_rect_alpha(x, y, 1, 1, s - 2, s - 2, tile_r)
            if ta > 0:
                color = SLATE
                alpha = ta
            # sticky note
            na = rounded_rect_alpha(x, y, note_x0, note_y0, note_x1, note_y1, note_r)
            if na > 0:
                color = blend(color, AMBER, na)
                alpha = max(alpha, na)
            # pin stem
            if abs(x - pin_cx) < s * 0.012 and pin_cy < y < note_y0 + s * 0.02:
                color = blend(color, STRING, 1.0)
                alpha = 1.0
            # pin head
            pa = circle_alpha(x, y, pin_cx, pin_cy, pin_r)
            if pa > 0:
                color = blend(color, RED, pa)
                alpha = max(alpha, pa)
            row += bytes((color[0], color[1], color[2], int(alpha * 255)))
        pixels += b"\x00" + row  # filter type 0 per scanline
    return pixels


def write_png(path, size):
    raw = make_icon(size)
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", compressed)
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    write_png(os.path.join(OUT_DIR, "pwa-192x192.png"), 192)
    write_png(os.path.join(OUT_DIR, "pwa-512x512.png"), 512)
    write_png(os.path.join(OUT_DIR, "apple-touch-icon.png"), 180)
