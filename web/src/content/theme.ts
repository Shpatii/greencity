// P4: colour scale for priority scores (0–100).

// Inferno-style sequential ramp, low priority (light) → high priority (dark).
// Lightness steps evenly (L* 85 → 17), so bands stay ordered under protan/deutan/tritan vision.
// The lightest band is faint on the light basemap: draw lines with a thin dark casing.
export const scoreColors = ['#fcd225', '#f98e09', '#dd513a', '#932667', '#420a68'] as const;

// Neutral grey for segments without a score. Pair it with a dashed line so it never relies on colour alone.
export const noDataColor = '#9e9e9e';

// Dark casing drawn under score lines (and in the legend) so the light bands stay visible.
export const lineCasingColor = '#525252';

// Selected street: thick dark halo with a bright line on top.
export const selectionColors = { halo: '#1e3a8a', line: '#3b82f6' } as const;

// Lower bound of bands 2–5; band i covers [scoreBreaks[i-1], scoreBreaks[i]).
export const scoreBreaks = [20, 40, 60, 80] as const;

export function colorForScore(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return noDataColor;
  const band = scoreBreaks.filter((b) => score >= b).length;
  return scoreColors[band];
}
