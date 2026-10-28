// P4: colour scale for priority scores (0–100).
import type { InfraClass } from '@/lib/types';

// Sequential ramp for the dark basemap, low priority (dim violet) → high priority (bright yellow).
// Lightness rises with priority (L* ≈ 35 → 87), so bands stay ordered under protan/deutan/tritan
// vision and "brighter means higher priority", as on the landing page.
export const scoreColors = ['#6b46a8', '#b0397f', '#e5484d', '#ff8a1f', '#ffd60a'] as const;

// Neutral grey for segments without a score. Pair it with a dashed line so it never relies on colour alone.
export const noDataColor = '#6b6b6b';

// Near-black casing under score lines (and in the legend) so overlapping lines stay apart.
export const lineCasingColor = '#050505';

// Selected street: white halo with a cyan line on top, outside the score ramp.
export const selectionColors = { halo: '#ffffff', line: '#22d3ee' } as const;

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

// Bike counter points: teal, outside the violet–yellow score ramp; dark ring for contrast on lines.
export const counterColors = { fill: '#2dd4bf', stroke: '#042f2e' } as const;

// Opacity of segments that are not infrastructure gaps while "Show only infrastructure gaps" is on.
export const dimmedOpacity = 0.12;
