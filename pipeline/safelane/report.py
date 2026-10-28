"""P3: PDF priority list (phase 3).

python -m safelane.report  ->  data/out/report.pdf (A4 portrait, default weights).
`python run.py --publish` copies it to web/public/report.pdf.
"""

import json
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from safelane.score import FACTORS

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "out"
REPORT_NAME = "report.pdf"
TOP_N = 20

TITLE = "SafeLane HN - Cycling safety priority list Heilbronn"
UNNAMED = "Unnamed street"
# Same labels as web/src/content/copy.ts factorLabels.
FACTOR_LABELS = {
    "safety": "Close passes",
    "danger": "Danger spots",
    "surface": "Rough surface",
    "air": "Fine dust",
    "flow": "Stop-and-go",
}
# Same wording as copy.ts methodBox.limits.
LIMITS = (
    "Riders chose their own routes, so popular streets have more data. "
    "A street with no data is not safe, just unmeasured.",
    "Passing cars are detected by AI. It misses some and miscounts others, so a single value can be off.",
    "Some streets have only a few measurements. Their scores are less certain "
    "and are scaled down by the confidence factor.",
)


def main_reason(props, weights):
    """Reason text with the largest weight x factor contribution (like web topReasons)."""
    texts = props.get("reason_texts") or {}
    if not texts:
        return ""
    key = max(texts, key=lambda k: weights[k] * props[f"f_{k}"])
    return texts[key]


def top_segments(features, n=TOP_N):
    ranked = [f["properties"] for f in features if f["properties"]["eligible"] and f["properties"]["rank"] is not None]
    return sorted(ranked, key=lambda p: p["rank"])[:n]


def _fmt_int(n):
    return f"{n:,}"


def _share(p):
    if p["share_below_150"] is None or not p["n_overtakes"]:
        return "-"
    return f"{p['share_below_150']:.0%} of {p['n_overtakes']}"


def source_line(meta, stats):
    """Data source; campaign numbers from stats.json only when it describes the same data."""
    line = f"Data: ATRAI senseBox:bike, {meta['city'].title()}. Data generated {meta['generated_at'][:10]}."
    if not stats:
        return line
    if stats.get("n_segments") != meta["n_segments"]:
        print(f"  warning: stats.json has {stats.get('n_segments')} segments, meta.json "
              f"{meta['n_segments']}; leaving campaign numbers out")
        return line
    parts = [f"{_fmt_int(stats['n_segments'])} street segments with measurements"]
    if "n_eligible" in stats:
        parts.append(f"{_fmt_int(stats['n_eligible'])} with enough data to rank")
    if "n_with_overtakes" in stats:
        parts.append(f"{_fmt_int(stats['n_with_overtakes'])} with recorded overtakes")
    return f"{line} {', '.join(parts)}."


def method_lines(meta):
    w = meta["default_weights"]
    weights = ", ".join(f"{FACTOR_LABELS[k]} {w[k]:.0%}" for k in FACTORS)
    return (
        "Each street segment gets five factors from 0 to 1: share of close passes under 150 cm, "
        "danger points per 100 m, surface roughness, fine-dust risk and stop-and-go traffic.",
        f"Default weights: {weights}.",
        f"Score = 100 x confidence x weighted sum of the factors, from 0 to 100; "
        f"confidence = min(1, measurements / {meta['confidence_n']}).",
        f"Only segments with at least {meta['min_points']} measurements are ranked; "
        "ties go to the segment with more measurements.",
        "The main reason is the factor that adds the most to the score at the default weights.",
    )


def build(out_dir=OUT_DIR, out_path=None):
    """Write the PDF from out_dir/segments.geojson, meta.json and (optional) stats.json."""
    out_dir = Path(out_dir)
    out_path = Path(out_path) if out_path else out_dir / REPORT_NAME
    features = json.loads((out_dir / "segments.geojson").read_text(encoding="utf-8"))["features"]
    meta = json.loads((out_dir / "meta.json").read_text(encoding="utf-8"))
    stats_path = out_dir / "stats.json"
    stats = json.loads(stats_path.read_text(encoding="utf-8")) if stats_path.exists() else None

    base = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10)
    h1 = ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=16, leading=20,
                        spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=14,
                        spaceBefore=10, spaceAfter=4)

    today = datetime.now(ZoneInfo("Europe/Berlin")).strftime("%Y-%m-%d")
    story = [
        Paragraph(escape(TITLE), h1),
        Paragraph(f"Generated {today}", body),
        Paragraph(escape(source_line(meta, stats)), body),
        Spacer(1, 4 * mm),
        Paragraph(f"Top {TOP_N} priority streets", h2),
    ]

    rows = [["Rank", "Street", "Score", "Measure-\nments", "Overtakes\n< 150 cm", "Main reason"]]
    for p in top_segments(features):
        rows.append([
            str(p["rank"]),
            Paragraph(escape(p["name"] or UNNAMED), small),
            f"{p['score']:.1f}",
            _fmt_int(p["n_points"]),
            _share(p),
            Paragraph(escape(main_reason(p, meta["default_weights"])), small),
        ])
    table = Table(rows, colWidths=[12 * mm, 47 * mm, 13 * mm, 17 * mm, 20 * mm, 65 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
        ("LEADING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (2, 0), (4, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, colors.black),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.lightgrey),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(table)

    story.append(Paragraph("Method", h2))
    story += [Paragraph(escape(line), body) for line in method_lines(meta)]

    story.append(Paragraph("Data limits", h2))
    story.append(ListFlowable(
        [ListItem(Paragraph(escape(t), body), leftIndent=10) for t in LIMITS],
        bulletType="bullet", start="-", leftIndent=10,
    ))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + ".part")
    # Uncompressed: text stays greppable in the file; it's a ~1-page list, so size doesn't matter.
    SimpleDocTemplate(
        str(tmp), pagesize=A4, title=TITLE, author="SafeLane HN", pageCompression=0,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
    ).build(story)
    tmp.replace(out_path)
    return out_path


def run(out_dir=OUT_DIR):
    print("report")
    path = build(out_dir)
    print(f"  wrote {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    run()
