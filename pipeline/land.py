"""Rasterise Natural Earth's land outline into the board's land mask.

The map prints empty land and open ocean as different faces, so continents read
even where no airport lights them. This writes src/board/land.bin: an
equirectangular bitmap, row-major from the north edge, stored as run lengths
(LEB128 varints) that alternate sea, land, sea, ... starting with sea.

The mask is static (coastlines don't move), so the output is committed and this
only needs re-running if the resolution or the latitude band changes.
Natural Earth is public domain. Run fetch.py first.
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).parent
SOURCE = ROOT / ".cache" / "ne_50m_land.geojson"
OUT = ROOT.parent / "src" / "board" / "land.bin"

# Must match NORTH / SOUTH in src/board/view.ts and LAND in src/board/land.ts.
NORTH = 80
SOUTH = -56
PER_DEGREE = 4  # 0.25° pixels

WIDTH = 360 * PER_DEGREE
HEIGHT = (NORTH - SOUTH) * PER_DEGREE


def rings(geometry):
    if geometry["type"] == "Polygon":
        yield from geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            yield from polygon


def main() -> None:
    features = json.loads(SOURCE.read_text())["features"]

    # For each pixel row, every x where a ring edge crosses the row's centre line.
    # Land polygons never overlap, so the even-odd rule over all rings fills land
    # and leaves holes (inland seas) open.
    crossings = [[] for _ in range(HEIGHT)]
    for feature in features:
        for ring in rings(feature["geometry"]):
            for (lon0, lat0), (lon1, lat1) in zip(ring, ring[1:] + ring[:1]):
                y0 = (NORTH - lat0) * PER_DEGREE - 0.5
                y1 = (NORTH - lat1) * PER_DEGREE - 0.5
                if y0 == y1:
                    continue
                lo, hi = min(y0, y1), max(y0, y1)
                for row in range(max(0, math.ceil(lo)), min(HEIGHT - 1, math.ceil(hi) - 1) + 1):
                    t = (row - y0) / (y1 - y0)
                    lon = lon0 + t * (lon1 - lon0)
                    crossings[row].append((lon + 180) * PER_DEGREE - 0.5)

    bits = bytearray(WIDTH * HEIGHT // 8)
    land = 0
    for row, xs in enumerate(crossings):
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            for col in range(max(0, math.ceil(a)), min(WIDTH - 1, math.floor(b)) + 1):
                i = row * WIDTH + col
                bits[i >> 3] |= 0x80 >> (i & 7)
                land += 1

    out = bytearray()
    for run in runs(bits):
        while True:
            byte = run & 0x7F
            run >>= 7
            out.append(byte | 0x80 if run else byte)
            if not run:
                break
    OUT.write_bytes(bytes(out))
    print(f"  land.bin: {WIDTH}x{HEIGHT}, {land / (WIDTH * HEIGHT):.1%} land, {len(out) / 1e3:.1f} kB")


def runs(bits: bytearray):
    current, length = 0, 0
    for i in range(WIDTH * HEIGHT):
        bit = 1 if bits[i >> 3] & (0x80 >> (i & 7)) else 0
        if bit == current:
            length += 1
        else:
            yield length
            current, length = bit, 1
    yield length


if __name__ == "__main__":
    main()
