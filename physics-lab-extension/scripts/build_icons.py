"""使用标准库绘制本地波形图标，无网络、无第三方依赖。"""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]


def write_icon(size):
    scale = 4
    high = size * scale
    pixels = []
    for y in range(high):
        row = []
        for x in range(high):
            u, v = (x + .5) / high, (y + .5) / high
            dx, dy = max(abs(u - .5) - .29, 0), max(abs(v - .5) - .29, 0)
            inside = dx * dx + dy * dy <= .19 ** 2
            color = (40, 126, 101, 255) if inside else (0, 0, 0, 0)
            for i, height in enumerate([.14, .32, .53, .32, .14]):
                cx = .22 + i * .14
                px, py = abs(u - cx), max(abs(v - .5) - height / 2 + .025, 0)
                if px * px + py * py <= .025 ** 2:
                    color = (245, 247, 230, 255)
            row.append(color)
        pixels.append(row)
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            for c in range(4):
                raw.append(round(sum(pixels[y*scale+j][x*scale+i][c] for j in range(scale) for i in range(scale)) / scale ** 2))

    def chunk(kind, content):
        return struct.pack('!I', len(content)) + kind + content + struct.pack('!I', zlib.crc32(kind + content) & 0xffffffff)

    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    (ROOT / 'icons' / f'icon-{size}.png').write_bytes(data)


if __name__ == '__main__':
    for size in [16, 48, 128]:
        write_icon(size)
    print('已生成 16 / 48 / 128 像素图标。')
