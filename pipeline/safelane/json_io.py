"""Strict decoding at the source boundary, including old Windows caches."""

import json
import warnings


def decode_source(data, source):
    """Prefer UTF-8 (with optional BOM); accept legacy Windows-1252 explicitly.

    Encoding cannot be inferred reliably for arbitrary bytes. Windows-1252 is
    the compatibility fallback for caches written by this pipeline on Windows,
    not a general-purpose encoding detector. Never discard undecodable bytes.
    """
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252")
        warnings.warn(
            f"{source}: decoding legacy Windows-1252 JSON; normalizing to UTF-8",
            UserWarning,
            stacklevel=2,
        )
        return text


def read_source_json(path):
    """Read and validate a raw JSON cache, atomically migrating it to UTF-8.

    Transcode the original text rather than reserializing so numbers, property
    order and geometry stay exactly as supplied. Invalid JSON is never rewritten.
    """
    data = path.read_bytes()
    text = decode_source(data, path)
    payload = json.loads(text)
    normalized = text.encode("utf-8")
    if normalized != data:
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(normalized)
        tmp.replace(path)
    return payload
