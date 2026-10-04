import zlib, struct, os

def make_icon(size, path):
    W = H = size
    px = [[(5, 8, 22, 255) for _ in range(W)] for _ in range(H)]
    cx, cy = W / 2, H / 2
    m = size * 0.14
    cw, ch = W - 2 * m, H - 2 * m
    r = size * 0.08
    for y in range(H):
        for x in range(W):
            dx = max(abs(x - cx) - (cw / 2 - r), 0)
            dy = max(abs(y - cy) - (ch / 2 - r), 0)
            inside = (dx * dx + dy * dy) <= r * r or (abs(x - cx) <= cw / 2 and abs(y - cy) <= ch / 2)
            if inside:
                px[y][x] = (16, 185, 129, 255)

    def line(x0, y0, x1, y1, w):
        steps = int(size * 2.2)
        for i in range(steps + 1):
            t = i / steps
            lx, ly = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for oy in range(-w, w + 1):
                for ox in range(-w, w + 1):
                    ix, iy = int(lx + ox), int(ly + oy)
                    if 0 <= ix < W and 0 <= iy < H:
                        px[iy][ix] = (5, 8, 22, 255)

    w = max(1, size // 22)
    line(m, m + ch * 0.12, cx, cy + ch * 0.05, w)
    line(m + cw, m + ch * 0.12, cx, cy + ch * 0.05, w)

    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in px)

    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


root = os.path.expanduser("~/temp-mail-extension/icons")
os.makedirs(root, exist_ok=True)
for s in [16, 32, 48, 128]:
    p = os.path.join(root, "icon%d.png" % s)
    make_icon(s, p)
    d = open(p, "rb").read(33)
    sig = d[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", d[16:24])
    print("icon%d.png %d bytes sig=%s %dx%d" % (s, os.path.getsize(p), sig, w, h))
