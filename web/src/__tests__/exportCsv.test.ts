import { buildCsv, csvFileName } from '@/lib/exportCsv';
import type { SegmentProps, Weights } from '@/lib/types';

const W: Weights = { safety: 0.35, danger: 0.25, surface: 0.15, air: 0.15, flow: 0.1 };
const META = { min_points: 5, confidence_n: 30 };

const feature = (id: string, f_safety: number, extra: Partial<SegmentProps> = {}) => ({
  properties: {
    id, osm_id: '123', name: `Street ${id}`, n_points: 30, confidence: 1, share_below_150: 0.584,
    f_safety, f_danger: 0, f_surface: 0, f_air: 0, f_flow: 0,
    reason_texts: { safety: 'close passes' }, ...extra,
  } as SegmentProps,
});

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('buildCsv', () => {
  it('starts with a BOM and uses ; with decimal commas', () => {
    const csv = buildCsv([feature('a', 0.5)], W, META);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, row] = lines(csv);
    expect(header.split(';')).toHaveLength(8);
    expect(row).toBe('1;Street a;123;17,5;1,000;30;58,4;close passes');
  });

  it('ranks with the given weights, skips ineligible segments and stops at n', () => {
    const features = [feature('low', 0.1), feature('high', 0.9), feature('few', 1, { n_points: 2 })];
    const rows = lines(buildCsv(features, W, META)).slice(1);
    expect(rows.map((r) => r.split(';')[1])).toEqual(['Street high', 'Street low']);
    expect(lines(buildCsv(features, W, META, 1))).toHaveLength(2);
  });

  it('quotes fields with separators or quotes and leaves nulls empty', () => {
    const f = feature('a', 0.5, { name: 'Weg "Süd"; Nord', osm_id: null, share_below_150: null });
    const row = lines(buildCsv([f], W, META))[1];
    expect(row).toBe('1;"Weg ""Süd""; Nord";;17,5;1,000;30;;close passes');
  });
});

it('names the file by local date', () => {
  expect(csvFileName(new Date(2026, 9, 3))).toBe('safelane-heilbronn-2026-10-03.csv');
});
