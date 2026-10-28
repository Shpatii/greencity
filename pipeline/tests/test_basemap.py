import math

import pytest

from safelane import basemap


def test_tile_ids_match_spec_vectors():
    assert basemap.zxy_to_tileid(0, 0, 0) == 0
    assert [basemap.zxy_to_tileid(1, x, y) for x, y in ((0, 0), (0, 1), (1, 1), (1, 0))] == [1, 2, 3, 4]
    assert basemap.zxy_to_tileid(12, 3423, 1763) == 19078479


def test_tile_range_matches_slippy_map_formula():
    # OSM wiki: x = (lon + 180) / 360 * n, y = (1 - ln(tan(lat) + sec(lat)) / pi) / 2 * n
    lon, lat, z = 9.22, 49.14, 14
    n, r = 2 ** z, math.radians(lat)
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)
    assert basemap.tile_range(lon, lat, lon, lat, z) == (x, x, y, y) == (8611, 8611, 5616, 5616)


def test_tile_ids_cover_every_zoom_once():
    ids = basemap.tile_ids((9.2, 49.1, 9.25, 49.15), max_zoom=3)
    assert ids == sorted(set(ids)) and len(ids) == 4  # one tile per zoom 0-3


@pytest.mark.parametrize("entries", [
    [(0, 0, 10, 1), (1, 10, 5, 1), (2, 15, 7, 3)],  # contiguous: offsets written as 0
    [(5, 0, 10, 1), (9, 100, 5, 0), (300, 20, 7, 2)],  # gaps, a leaf pointer, back-reference
])
def test_directory_round_trip(entries):
    assert basemap.deserialize_directory(basemap.serialize_directory(entries)) == entries


class BytesRemote(basemap.Remote):
    """basemap.Remote reading from an in-memory archive."""

    def __init__(self, blob):
        self.blob = blob
        super().__init__("memory", None)

    def read(self, offset, length):
        return self.blob[offset:offset + length]


def test_write_archive_reads_back(tmp_path):
    tiles = {0: b"world", 1: b"sea", 2: b"sea", 3: b"land", 20: b"sea"}
    path = tmp_path / "x.pmtiles"
    n_entries, n_contents = basemap.write_archive(
        path, tiles, {"name": "test"}, (9.0, 49.0, 9.5, 49.3), tile_compression=2, tile_type=1, max_zoom=2)
    assert n_contents == 3  # "sea" stored once
    assert n_entries == 4  # tiles 1 and 2 share content and are adjacent: one run

    remote = BytesRemote(path.read_bytes())
    assert remote.metadata() == {"name": "test"}
    assert remote.tile_compression == 2 and remote.tile_type == 1
    data = remote.blob[remote.data_offset:]
    for tile_id, blob in tiles.items():
        offset, length = remote.find(tile_id)
        assert data[offset:offset + length] == blob
    assert remote.find(4) is None and remote.find(21) is None


def test_written_archive_is_deterministic(tmp_path):
    args = ({1: b"a", 2: b"b"}, {"k": 1}, (9.0, 49.0, 9.5, 49.3), 2, 1, 1)
    basemap.write_archive(tmp_path / "a.pmtiles", *args)
    basemap.write_archive(tmp_path / "b.pmtiles", *args)
    assert (tmp_path / "a.pmtiles").read_bytes() == (tmp_path / "b.pmtiles").read_bytes()
