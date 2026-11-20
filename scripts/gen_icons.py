import math
import os
import struct
import zlib


def write_png(path: str, width: int, height: int, rgba_bytes: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw_rows = bytearray()
    stride = width * 4
    for y in range(height):
        raw_rows.append(0)
        start = y * stride
        raw_rows.extend(rgba_bytes[start : start + stride])

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_rows), 9)
    png_data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    from pathlib import Path
    Path(path).write_bytes(png_data)


def point_in_poly(px: float, py: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / ((yj - yi) or 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def dist_to_segment(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    vx, vy = x2 - x1, y2 - y1
    wx, wy = px - x1, py - y1
    c1 = wx * vx + wy * vy
    if c1 <= 0:
        return math.hypot(px - x1, py - y1)
    c2 = vx * vx + vy * vy
    if c2 <= c1:
        return math.hypot(px - x2, py - y2)
    t = c1 / c2
    return math.hypot(px - (x1 + t * vx), py - (y1 + t * vy))


def dist_to_poly_edge(px: float, py: float, poly: list[tuple[float, float]]) -> float:
    best = 1e9
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        d = dist_to_segment(px, py, x1, y1, x2, y2)
        if d < best:
            best = d
    return best


def render_icon(size: int) -> bytes:
    buf = bytearray(size * size * 4)
    shield = [(0.50, 0.15), (0.79, 0.29), (0.74, 0.65), (0.50, 0.85), (0.26, 0.65), (0.21, 0.29)]
    bolt = [(0.54, 0.25), (0.37, 0.52), (0.49, 0.52), (0.44, 0.75), (0.65, 0.46), (0.52, 0.46)]

    for y in range(size):
        ny = (y + 0.5) / size
        for x in range(size):
            nx = (x + 0.5) / size
            t_bg = (nx + ny) * 0.5
            r = int(13 + 14 * t_bg)
            g = int(27 + 31 * t_bg)
            b = int(42 + 50 * t_bg)

            dist_c = math.hypot(nx - 0.5, ny - 0.5)
            if abs(dist_c - 0.39) < 0.014:
                r, g, b = 0, 210, 255

            if point_in_poly(nx, ny, shield):
                grad_s = max(0.0, min(1.0, (ny - 0.15) / 0.70))
                r = int(255 - 55 * grad_s)
                g = int(71 - 28 * grad_s)
                b = int(87 - 24 * grad_s)

            if dist_to_poly_edge(nx, ny, shield) < 0.012:
                r, g, b = 0, 210, 255

            if point_in_poly(nx, ny, bolt):
                grad_b = max(0.0, min(1.0, (ny - 0.25) / 0.50))
                r = 255
                g = int(226 - 42 * grad_b)
                b = int(102 - 102 * grad_b)
            elif dist_to_poly_edge(nx, ny, bolt) < 0.008:
                r, g, b = 255, 248, 220

            idx = (y * size + x) * 4
            buf[idx] = r
            buf[idx + 1] = g
            buf[idx + 2] = b
            buf[idx + 3] = 255

    return bytes(buf)


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(root, "icons")
    os.makedirs(icons_dir, exist_ok=True)
    for size in (192, 512):
        pixels = render_icon(size)
        write_png(os.path.join(icons_dir, f"icon-{size}.png"), size, size, pixels)
        print(f"Generated icons/icon-{size}.png")


if __name__ == "__main__":
    main()
