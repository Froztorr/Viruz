#!/usr/bin/env python3
"""Verify that a file is a structurally intact PNG.

Checks the 8-byte signature, then walks every chunk and recomputes its
CRC32 against the stored value. That catches truncation and any
single-character corruption introduced while the image was travelling as
base64 text, which a signature check alone would miss.

Standard library only, on purpose: nothing to install on the runner.

Usage: verify_png.py FILE [FILE ...]
"""

import struct
import sys
import zlib

SIGNATURE = b'\x89PNG\r\n\x1a\n'


def verify(path):
    with open(path, 'rb') as fh:
        data = fh.read()

    if not data.startswith(SIGNATURE):
        return f'{path}: not a PNG (bad signature)'

    offset = len(SIGNATURE)
    saw_iend = False

    while offset < len(data):
        if offset + 8 > len(data):
            return f'{path}: truncated chunk header at byte {offset}'

        (length,) = struct.unpack('>I', data[offset:offset + 4])
        kind = data[offset + 4:offset + 8]
        body_start = offset + 8
        crc_start = body_start + length

        if crc_start + 4 > len(data):
            return f'{path}: truncated {kind.decode("latin-1")} chunk'

        body = data[body_start:crc_start]
        (stored,) = struct.unpack('>I', data[crc_start:crc_start + 4])
        actual = zlib.crc32(kind + body) & 0xFFFFFFFF

        if actual != stored:
            return (f'{path}: CRC mismatch in {kind.decode("latin-1")} '
                    f'chunk (stored {stored:#010x}, computed {actual:#010x})')

        offset = crc_start + 4
        if kind == b'IEND':
            saw_iend = True
            break

    if not saw_iend:
        return f'{path}: no IEND chunk, file is incomplete'
    return None


def main(argv):
    if not argv:
        print('usage: verify_png.py FILE [FILE ...]', file=sys.stderr)
        return 2

    failures = 0
    for path in argv:
        problem = verify(path)
        if problem:
            print(f'::error::{problem}')
            failures += 1

    if failures:
        print(f'{failures} file(s) failed verification', file=sys.stderr)
        return 1

    print(f'{len(argv)} file(s) verified')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
