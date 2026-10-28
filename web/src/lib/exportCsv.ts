// CSV of the current ranking, for German Excel: ";" separator, decimal comma, UTF-8 BOM.
import { copy } from '@/content/copy';
import { rankSegments } from './score';
import { topReasons } from './stats';
import type { Meta, SegmentProps, Weights } from './types';

const SEP = ';';
const BOM = '﻿';

/** Decimal comma, no thousands separator, so Excel (de) reads it as a number. */
function num(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Quote a field when it contains the separator, a quote or a line break. */
function field(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV text (with BOM) of the top n eligible segments for weights w. */
export function buildCsv(
  features: { properties: SegmentProps }[],
  weights: Weights,
  meta: Pick<Meta, 'min_points' | 'confidence_n'>,
  n = 50,
): string {
  const byId = new Map(features.map((f) => [f.properties.id, f.properties]));
  const rows = rankSegments(features, weights, meta)
    .filter((r) => r.rank !== null)
    .slice(0, n)
    .map((r) => {
      const p = byId.get(r.id)!;
      return [
        String(r.rank),
        p.name ?? copy.unnamed,
        p.osm_id ?? '',
        num(r.score!, 1),
        num(p.confidence, 3),
        String(p.n_points),
        p.share_below_150 === null ? '' : num(p.share_below_150 * 100, 1),
        topReasons(p, weights, 1)[0]?.text ?? '',
      ];
    });
  return BOM + [copy.csv.header, ...rows].map((row) => row.map(field).join(SEP)).join('\r\n') + '\r\n';
}

/** safelane-heilbronn-YYYY-MM-DD.csv, local date. */
export function csvFileName(date = new Date()): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `safelane-heilbronn-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.csv`;
}

/** Build the CSV of the current ranking and download it. */
export function exportTopN(
  features: { properties: SegmentProps }[],
  weights: Weights,
  meta: Pick<Meta, 'min_points' | 'confidence_n'>,
  n = 50,
): void {
  const blob = new Blob([buildCsv(features, weights, meta, n)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = csvFileName();
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
