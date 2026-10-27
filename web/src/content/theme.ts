/** Visual design tokens shared between the map (MapLibre expressions) and React UI. */
export const theme = {
  /** Colour for segments without enough data to score (eligible=false). */
  noDataColor: '#94a3b8',

  /**
   * Five-stop colour ramp mapped to score 0-100.
   * 0 = safest / lowest priority (green), 100 = most dangerous / highest priority (red).
   * Used both in the MapLibre interpolation expression and for UI dots.
   */
  scoreColors: [
    [0, '#22c55e'],
    [25, '#84cc16'],
    [50, '#eab308'],
    [75, '#f97316'],
    [100, '#ef4444'],
  ] as [number, string][],

  /** Highlight colours for the selected segment. */
  highlightInner: '#3b82f6',
  highlightOuter: '#1e3a8a',
} as const;

/**
 * Map a score (0-100) to the nearest stop colour.
 * Used for the coloured dot in RankList.
 */
export function scoreToColor(score: number): string {
  const stops = theme.scoreColors;
  let best = stops[0];
  let bestDiff = Math.abs(score - stops[0][0]);
  for (const stop of stops) {
    const diff = Math.abs(score - stop[0]);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = stop;
    }
  }
  return best[1];
}
