import copy
import json
from pathlib import Path
from unittest.mock import MagicMock

import geopandas as gpd
import pytest
from shapely.geometry import LineString

from safelane import config, export, fuse, ingest, score
from safelane.json_io import read_source_json
from tests.test_contract import EXAMPLE_FEATURE

NAME = "Bärenstraße, Mönch, Brücke – €"


def collection():
    feature = copy.deepcopy(EXAMPLE_FEATURE)
    feature["properties"]["name"] = NAME
    return {"type": "FeatureCollection", "features": [feature]}


@pytest.mark.parametrize("encoding", ["utf-8", "utf-8-sig", "cp1252"])
def test_cached_source_is_losslessly_normalized(tmp_path, encoding):
    path = tmp_path / "source.geojson"
    # Keep unusual numeric formatting to check transcoding preserves the text.
    text = json.dumps(collection(), ensure_ascii=False).replace("9.2101", "9.2101000")
    path.write_bytes(text.encode(encoding))
    if encoding == "cp1252":
        with pytest.warns(UserWarning, match="Windows-1252"):
            actual = read_source_json(path)
    else:
        actual = read_source_json(path)
    assert actual == collection()
    assert path.read_bytes() == text.encode("utf-8")
    before = path.stat().st_mtime_ns
    assert read_source_json(path) == actual
    assert path.stat().st_mtime_ns == before


def test_ascii_source_needs_no_migration(tmp_path):
    path = tmp_path / "source.json"
    data = b'{"name": "ASCII"}'
    path.write_bytes(data)
    assert read_source_json(path) == {"name": "ASCII"}
    assert path.read_bytes() == data


def test_undecodable_source_fails_without_changing_cache(tmp_path):
    path = tmp_path / "source.json"
    data = b'{"name": "\x81"}'  # Undefined in Windows-1252 too.
    path.write_bytes(data)
    with pytest.raises(UnicodeDecodeError):
        read_source_json(path)
    assert path.read_bytes() == data


def test_invalid_legacy_json_is_not_rewritten(tmp_path):
    path = tmp_path / "source.json"
    data = '{"name": "Straße"'.encode("cp1252")
    path.write_bytes(data)
    with pytest.warns(UserWarning, match="Windows-1252"):
        with pytest.raises(json.JSONDecodeError):
            read_source_json(path)
    assert path.read_bytes() == data


@pytest.mark.parametrize("encoding", ["utf-8", "cp1252"])
def test_download_decodes_bytes_before_parsing(encoding):
    data = json.dumps(collection(), ensure_ascii=False).encode(encoding)
    response = MagicMock()
    response.__enter__.return_value = response
    # One-byte chunks also split multibyte UTF-8 characters.
    response.iter_content.return_value = [data[i:i + 1] for i in range(len(data))]
    response.encoding = "iso-8859-1"  # Ignore requests' HTTP text default.
    session = MagicMock()
    session.get.return_value = response
    if encoding == "cp1252":
        with pytest.warns(UserWarning, match="Windows-1252"):
            actual = ingest._get_json(session, "/test")
    else:
        actual = ingest._get_json(session, "/test")
    assert actual == collection()
    response.raise_for_status.assert_called_once()


def test_ingest_migrates_mixed_cached_encodings_without_download(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "RAW_DIR", tmp_path)
    monkeypatch.setattr(config, "COLLECTIONS", {"one": "utf8", "two": "legacy"})
    text = json.dumps(collection(), ensure_ascii=False)
    (tmp_path / "utf8.geojson").write_bytes(text.encode("utf-8"))
    (tmp_path / "legacy.geojson").write_bytes(text.encode("cp1252"))
    campaign = tmp_path / f"campaign_{ingest.CAMPAIGN}.json"
    campaign.write_bytes(json.dumps({"name": NAME}, ensure_ascii=False).encode("cp1252"))
    download = MagicMock(side_effect=AssertionError("cache should be reused"))
    monkeypatch.setattr(ingest, "_download_collection", download)
    monkeypatch.setattr(ingest, "_get_json", download)
    with pytest.warns(UserWarning, match="Windows-1252"):
        ingest.run()
    for name in ("utf8.geojson", "legacy.geojson"):
        assert json.loads((tmp_path / name).read_bytes().decode("utf-8")) == collection()
    assert json.loads(campaign.read_bytes().decode("utf-8")) == {"name": NAME}
    assert NAME in (tmp_path / "INSPECT.md").read_bytes().decode("utf-8")


@pytest.mark.parametrize("encoding", ["utf-8", "cp1252"])
def test_fuse_reads_utf8_and_migrates_standalone_legacy_cache(tmp_path, monkeypatch, encoding):
    monkeypatch.setattr(fuse, "RAW_DIR", tmp_path)
    path = tmp_path / f"{config.COLLECTIONS['road_network']}.geojson"
    path.write_bytes(json.dumps(collection(), ensure_ascii=False).encode(encoding))
    if encoding == "cp1252":
        with pytest.warns(UserWarning, match="Windows-1252"):
            frame = fuse._load("road_network")
    else:
        frame = fuse._load("road_network")
    assert frame.iloc[0]["name"] == NAME
    assert frame.iloc[0]["id"] == EXAMPLE_FEATURE["properties"]["id"]
    assert frame.crs.to_string() == config.METRIC_CRS
    assert json.loads(path.read_bytes().decode("utf-8")) == collection()
    for actual, expected in zip(frame.to_crs("EPSG:4326").geometry.iloc[0].coords,
                                EXAMPLE_FEATURE["geometry"]["coordinates"]):
        assert actual == pytest.approx(expected, abs=1e-9)


def test_all_json_writers_ignore_platform_default_encoding(tmp_path, monkeypatch):
    write_text = Path.write_text

    def windows_write_text(self, data, encoding=None, **kwargs):
        return write_text(self, data, encoding=encoding or "cp1252", **kwargs)

    monkeypatch.setattr(Path, "write_text", windows_write_text)
    for writer in (ingest._write_json, export._write_json):
        path = tmp_path / "test.json"
        writer(path, {"name": NAME})
        assert json.loads(path.read_bytes().decode("utf-8")) == {"name": NAME}


def test_export_score_publish_preserve_unicode_geometry_and_scores(tmp_path, monkeypatch):
    out = tmp_path / "out"
    web = tmp_path / "web"
    monkeypatch.setattr(export, "OUT_DIR", out)
    monkeypatch.setattr(export, "WEB_DIR", web)
    props = collection()["features"][0]["properties"]
    geometry = gpd.GeoSeries([LineString(EXAMPLE_FEATURE["geometry"]["coordinates"])], crs="EPSG:4326")
    export.write(geometry, [props], danger_p95=5.0, city_share=0.5, stats={})
    original = json.loads((out / "segments.geojson").read_bytes().decode("utf-8"))
    meta_path = out / "meta.json"
    meta = json.loads(meta_path.read_bytes().decode("utf-8"))
    meta["source"] = NAME  # Check score's metadata roundtrip too.
    export._write_json(meta_path, meta)
    score.run(out_dir=out)
    scored = json.loads((out / "segments.geojson").read_bytes().decode("utf-8"))
    feature = scored["features"][0]
    expected = {**props, "rank": 1, "reason_texts": score.reason_texts(props)}
    assert feature["properties"] == expected
    assert feature["properties"]["score"] == 49.9
    assert feature["geometry"] == original["features"][0]["geometry"]
    assert scored["type"] == "FeatureCollection"
    assert json.loads(meta_path.read_bytes().decode("utf-8"))["source"] == NAME
    score.run(out_dir=out)
    assert json.loads((out / "segments.geojson").read_bytes().decode("utf-8")) == scored
    export.run()
    for name in export.OUT_FILES:
        assert (web / name).read_bytes() == (out / name).read_bytes()
        json.loads((web / name).read_bytes().decode("utf-8"))
