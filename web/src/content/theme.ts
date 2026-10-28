// P4: colour scale for priority scores (0–100).
import type { InfraClass } from '@/lib/types';

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

// Infrastructure badges (SegmentCard), most to least protection. Dark text on a light fill, AA contrast.
export const infraColors: Record<InfraClass, { bg: string; text: string }> = {
  separated: { bg: '#dcfce7', text: '#14532d' },
  bike_street: { bg: '#ccfbf1', text: '#134e4a' },
  painted_lane: { bg: '#fef3c7', text: '#78350f' },
  shared_bus: { bg: '#ffedd5', text: '#7c2d12' },
  shared: { bg: '#ffedd5', text: '#7c2d12' },
  none: { bg: '#fee2e2', text: '#7f1d1d' },
};

// Bike counter points: teal, outside the yellow–purple score ramp; white ring for contrast on lines.
export const counterColors = { fill: '#0f766e', stroke: '#ffffff' } as const;

// Opacity of segments that are not infrastructure gaps while "Show only infrastructure gaps" is on.
export const dimmedOpacity = 0.15;
