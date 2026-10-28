"""Self-hosted base map: no map request leaves the site (README "Base map").

    python run.py --basemap        # a few times a year; writes web/public/basemap/

Cuts the road network area out of the Protomaps daily planet build (a PMTiles v3 archive of
OpenStreetMap vector tiles) with HTTP range requests, so only the needed tiles are downloaded,
and writes it as one small PMTiles file. Also copies the fonts and sprites the style needs
(@protomaps/basemaps, web/src/components/MapView.tsx). Format:
https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
"""

import gzip
import json
import math
import struct
from bisect import bisect_right
from pathlib import Path
from urllib.parse import quote

import geopandas as gpd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from safelane import config

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "web" / "public" / "basemap"
ARCHIVE = "heilbronn.pmtiles"
BUILDS_URL = "https://build-metadata.protomaps.dev/builds.json"
BUILD_BASE = "https://build.protomaps.com/"
ASSETS_BASE = "https://protomaps.github.io/basemaps-assets/"
# Fonts and sprites of @protomaps/basemaps 5.x, namedFlavor("light").
FONTSTACKS = ("Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic")
# Glyph ranges up to U+2FFF: Latin, Greek, Cyrillic, Arabic, Hebrew, punctuation, symbols.
# MapLibre draws CJK with a local font (localIdeographFontFamily) and never requests those ranges.
GLYPH_END = 0x3000
SPRITES = ("sprites/v4/light.json", "sprites/v4/light.png", "sprites/v4/light@2x.json", "sprites/v4/light@2x.png")
MAX_ZOOM = 15
BUFFER_M = 3000  # context around the road network
CENTER_ZOOM = 13
HEADER_LEN = 127
ROOT_DIR_MAX = 16384  # spec: header + root directory fit in the first 16 KiB
GZIP = 2
MERGE_GAP = 256 * 1024  # fetch tiles less than this apart in one request
MAX_CHUNK = 16 * 1024 * 1024


# --- Tile ids (Hilbert curve per zoom level) ------------------------------------------------------

def zxy_to_tileid(z, x, y):
    acc = (4 ** z - 1) // 3  # tiles on all lower zoom levels
    n = 1 << z
    d, s = 0, n >> 1
    while s > 0:
        rx, ry = int(x & s > 0), int(y & s > 0)
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1:
                x, y = n - 1 - x, n - 1 - y
            x, y = y, x
        s >>= 1
    return acc + d


def tile_range(west, south, east, north, z):
    """(x0, x1, y0, y1), inclusive, of the web mercator tiles covering the box at zoom z."""
    n = 1 << z

    def tx(lon):
        return min(n - 1, max(0, int((lon + 180) / 360 * n)))

    def ty(lat):
        r = math.radians(lat)
        return min(n - 1, max(0, int((1 - math.asinh(math.tan(r)) / math.pi) / 2 * n)))

    return tx(west), tx(east), ty(north), ty(south)


def tile_ids(bounds, max_zoom=MAX_ZOOM):
    west, south, east, north = bounds
    ids = []
    for z in range(max_zoom + 1):
        x0, x1, y0, y1 = tile_range(west, south, east, north, z)
        ids += [zxy_to_tileid(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    return sorted(ids)


# --- Directories ----------------------------------------------------------------------------------

def _read_varint(buf, pos):
    value = shift = 0
    while True:
        b = buf[pos]
        pos += 1
        value |= (b & 0x7F) << shift
        if b < 0x80:
            return value, pos
        shift += 7


def _write_varint(out, value):
    while value >= 0x80:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.append(value)


def deserialize_directory(raw):
    """Uncompressed directory bytes -> [(tile_id, offset, length, run_length)]."""
    n, pos = _read_varint(raw, 0)
    cols = []
    for _ in range(3):  # tile id deltas, run lengths, lengths
        col = []
        for _ in range(n):
            v, pos = _read_varint(raw, pos)
            col.append(v)
        cols.append(col)
    deltas, runs, lengths = cols
    ids, last = [], 0
    for d in deltas:
        last += d
        ids.append(last)
    offsets = []
    for i in range(n):
        v, pos = _read_varint(raw, pos)
        offsets.append(offsets[i - 1] + lengths[i - 1] if v == 0 and i > 0 else v - 1)
    return list(zip(ids, offsets, lengths, runs))


def serialize_directory(entries):
    out = bytearray()
    _write_varint(out, len(entries))
    last = 0
    for tile_id, _, _, _ in entries:
        _write_varint(out, tile_id - last)
        last = tile_id
    for *_, run in entries:
        _write_varint(out, run)
    for _, _, length, _ in entries:
        _write_varint(out, length)
    for i, (_, offset, _, _) in enumerate(entries):
        prev = entries[i - 1] if i else None
        _write_varint(out, 0 if prev and offset == prev[1] + prev[2] else offset + 1)
    return bytes(out)


def _gzip(data):
    return gzip.compress(data, mtime=0)  # mtime 0: same input, same bytes


# --- Reading the planet build ---------------------------------------------------------------------

class Remote:
    """Range reads from a remote PMTiles archive."""

    def __init__(self, url, session):
        self.url, self.session = url, session
        h = self.read(0, HEADER_LEN)
        if h[:7] != b"PMTiles" or h[7] != 3:
            raise ValueError(f"{url}: not a PMTiles v3 archive")
        (self.root_offset, self.root_length, self.meta_offset, self.meta_length, self.leaf_offset, _,
         self.data_offset, *_) = struct.unpack_from("<11Q", h, 8)
        _, internal, self.tile_compression, self.tile_type = struct.unpack_from("<4B", h, 96)
        if internal != GZIP:
            raise ValueError(f"{url}: internal compression {internal}, expected gzip")
        self.root = self._directory(self.root_offset, self.root_length)
        self.leaves = {}

    def read(self, offset, length):
        r = self.session.get(self.url, headers={"Range": f"bytes={offset}-{offset + length - 1}"},
                             timeout=(10, 120))
        r.raise_for_status()
        if r.status_code != 206 or len(r.content) != length:
            raise ValueError(f"{self.url}: range {offset}+{length} returned {r.status_code}, {len(r.content)} bytes")
        return r.content

    def _directory(self, offset, length):
        return deserialize_directory(gzip.decompress(self.read(offset, length)))

    def metadata(self):
        return json.loads(gzip.decompress(self.read(self.meta_offset, self.meta_length)))

    def find(self, tile_id):
        """(offset in the tile data section, length) of tile_id, or None when the build has no such tile."""
        entries = self.root
        for _ in range(4):  # root plus at most three leaf levels
            i = bisect_right([e[0] for e in entries], tile_id) - 1
            if i < 0:
                return None
            start, offset, length, run = entries[i]
            if run:
                return (offset, length) if tile_id < start + run else None
            key = self.leaf_offset + offset
            if key not in self.leaves:
                self.leaves[key] = self._directory(key, length)
            entries = self.leaves[key]
        raise ValueError(f"{self.url}: directory deeper than 4 levels")


def fetch_tiles(remote, wanted):
    """{tile_id: bytes} for the tile ids the build has, fetched in merged ranges."""
    where = {t: hit for t in wanted if (hit := remote.find(t))}
    spans = sorted(set(where.values()))
    content, chunk = {}, []

    def flush():
        start = chunk[0][0]
        end = max(o + n for o, n in chunk)
        data = remote.read(remote.data_offset + start, end - start)
        for o, n in chunk:
            content[(o, n)] = data[o - start:o - start + n]

    for span in spans:
        if chunk and (span[0] - max(o + n for o, n in chunk) > MERGE_GAP or span[0] + span[1] - chunk[0][0] > MAX_CHUNK):
            flush()
            chunk = []
        chunk.append(span)
    if chunk:
        flush()
    return {t: content[span] for t, span in where.items()}


# --- Writing the extract --------------------------------------------------------------------------

def write_archive(path, tiles, metadata, bounds, tile_compression, tile_type, max_zoom):
    """PMTiles v3 file from {tile_id: bytes}; identical tile contents are stored once."""
    data, entries, stored = bytearray(), [], {}
    for tile_id in sorted(tiles):
        blob = tiles[tile_id]
        if blob not in stored:
            stored[blob] = len(data)
            data += blob
        offset = stored[blob]
        last = entries[-1] if entries else None
        if last and last[1] == offset and last[0] + last[3] == tile_id:
            entries[-1] = (last[0], last[1], last[2], last[3] + 1)
        else:
            entries.append((tile_id, offset, len(blob), 1))

    root = _gzip(serialize_directory(entries))
    if HEADER_LEN + len(root) > ROOT_DIR_MAX:
        raise ValueError(f"root directory {len(root)} bytes does not fit in 16 KiB; area too large")
    meta = _gzip(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    root_offset = HEADER_LEN
    meta_offset = root_offset + len(root)
    data_offset = meta_offset + len(meta)
    west, south, east, north = bounds
    e7 = [round(v * 1e7) for v in (west, south, east, north)]
    header = b"PMTiles" + bytes([3]) + struct.pack(
        "<11Q", root_offset, len(root), meta_offset, len(meta), data_offset, 0, data_offset, len(data),
        sum(e[3] for e in entries), len(entries), len(stored),
    ) + struct.pack("<6B", 1, GZIP, tile_compression, tile_type, 0, max_zoom) + struct.pack(
        "<4iBii", *e7, CENTER_ZOOM, round((west + east) / 2 * 1e7), round((south + north) / 2 * 1e7))
    assert len(header) == HEADER_LEN
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_bytes(header + root + meta + bytes(data))
    tmp.replace(path)
    return len(entries), len(stored)


# --- Run --------------------------------------------------------------------------------------------

def _session():
    s = requests.Session()
    s.headers["User-Agent"] = config.USER_AGENT
    retry = Retry(total=4, backoff_factor=2, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=("GET",))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def area_bounds(buffer_m=BUFFER_M):
    """Road network extent plus buffer_m, as (west, south, east, north) in WGS84."""
    road = gpd.read_file(RAW_DIR / f"{config.COLLECTIONS['road_network']}.geojson").to_crs(config.METRIC_CRS)
    grown = gpd.GeoSeries(road.geometry.union_all().envelope.buffer(buffer_m), crs=config.METRIC_CRS)
    return tuple(round(float(v), 5) for v in grown.to_crs("EPSG:4326").total_bounds)


def latest_build(session):
    builds = session.get(BUILDS_URL, timeout=(10, 60)).json()
    return max(b["key"] for b in builds if b["key"].endswith(".pmtiles"))


def copy_assets(session, out_dir=OUT_DIR):
    paths = [f"fonts/{f}/{lo}-{lo + 255}.pbf" for f in FONTSTACKS for lo in range(0, GLYPH_END, 256)]
    for rel in paths + list(SPRITES):
        r = session.get(ASSETS_BASE + quote(rel), timeout=(10, 60))
        r.raise_for_status()
        dest = out_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.content)
    return len(paths), len(SPRITES)


def run():
    print("basemap")
    session = _session()
    bounds = area_bounds()
    build = latest_build(session)
    remote = Remote(BUILD_BASE + build, session)
    wanted = tile_ids(bounds)
    print(f"  {build}: {len(wanted)} tiles z0-{MAX_ZOOM} for bbox {bounds}")
    tiles = fetch_tiles(remote, wanted)
    metadata = {**remote.metadata(), "safelane_build": build, "safelane_bounds": list(bounds)}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / ARCHIVE
    n_entries, n_contents = write_archive(path, tiles, metadata, bounds, remote.tile_compression,
                                          remote.tile_type, MAX_ZOOM)
    print(f"  wrote {path} ({path.stat().st_size / 1048576:.1f} MiB, {len(tiles)} tiles, "
          f"{n_contents} distinct, {n_entries} directory entries)")
    n_fonts, n_sprites = copy_assets(session)
    print(f"  copied {n_fonts} glyph ranges and {n_sprites} sprite files -> {OUT_DIR}")


if __name__ == "__main__":
    run()
