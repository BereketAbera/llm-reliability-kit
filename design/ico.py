"""Packs PNG files into one .ico (PNG-compressed entries, read by every current browser).

Usage: python3 design/ico.py 16.png 32.png 48.png out.ico
"""

import struct
import sys
from pathlib import Path


def png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG file")
    return struct.unpack(">II", data[16:24])


def pack(images: list[bytes]) -> bytes:
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = len(header) + 16 * len(images)
    entries, blobs = b"", b""
    for data in images:
        width, height = png_size(data)
        entries += struct.pack("<BBBBHHII", width % 256, height % 256, 0, 0, 1, 32, len(data), offset + len(blobs))
        blobs += data
    return header + entries + blobs


if __name__ == "__main__":
    *sources, target = sys.argv[1:]
    Path(target).write_bytes(pack([Path(source).read_bytes() for source in sources]))
    print(f"{target}: {len(sources)} sizes")
