"""Refresh publishing must detect changes outside the street scores too."""
import importlib.util
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "gates", Path(__file__).resolve().parents[2] / "qa" / "gates.py"
)
gates = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gates)


@pytest.mark.parametrize("changed_path", [None, *gates.PUBLISHED_FILES])
@pytest.mark.parametrize("gates_pass", [True, False])
def test_publish_decision(tmp_path, monkeypatch, changed_path, gates_pass):
    baseline = {path: b"original" for path in gates.PUBLISHED_FILES}
    baseline[f"{gates.PUBLISHED}/meta.json"] = b'{"n_eligible": 10}'
    for path, content in baseline.items():
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    if changed_path:
        # Whitespace changes keep meta valid while changing its published bytes.
        with (tmp_path / changed_path).open("ab") as f:
            f.write(b"\n")
    output = tmp_path / "github-output"
    monkeypatch.setattr(gates, "ROOT", tmp_path)
    monkeypatch.setattr(gates, "at_baseline", lambda ref, path: baseline.get(path))
    monkeypatch.setattr(gates, "run", lambda *args, **kwargs: gates_pass)
    monkeypatch.setenv("GITHUB_OUTPUT", str(output))

    assert gates.main([]) == (0 if gates_pass else 1)
    expected = "true" if changed_path and gates_pass else "false"
    assert output.read_text() == f"changed={expected}\n"
