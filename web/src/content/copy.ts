// P4: all user-facing text.
// TODO(de): add German copy as `copyDe: Copy` and pick by locale.
import type { FactorKey } from '@/lib/types';

type FiveBands<T> = readonly [T, T, T, T, T];

export interface Copy {
  appTitle: string;
  tagline: string;
  loading: string;
  loadError: string;
  unnamed: string;
  noScore: string;
  close: string;
  popup: {
    /** Separator between name and score in the map hover popup. */
    separator: string;
  };
  rankList: {
    title: string;
    colRank: string;
    colName: string;
    colScore: string;
    colPoints: string;
  };
  factorLabels: Record<FactorKey, string>;
  factorTooltips: Record<FactorKey, string>;
  legend: {
    title: string;
    // Ordered low → high priority; matches scoreColors / scoreBreaks in theme.ts.
    bands: FiveBands<{ label: string; range: string }>;
    noData: string;
  };
  methodBox: {
    title: string;
    toggle: string;
    explanation: string;
    weightsCaption: string;
    factorHeader: string;
    weightHeader: string;
    limitsTitle: string;
    limits: readonly string[];
    dataSource: (generatedAt: string) => string;
  };
  weightSliders: {
    title: string;
    hint: string;
    reset: string;
    /** Screen-reader label for one slider, e.g. "Close passes weight". */
    sliderLabel: (factor: string) => string;
  };
  emptyStates: {
    noSegmentSelected: string;
    noEligibleSegments: string;
    noRank: string;
    notEnoughMeasurements: string;
  };
  cardLabels: {
    score: string;
    measurements: string;
    overtakes: string;
    confidence: string;
    topReasons: string;
  };
}

export const copy: Copy = {
  appTitle: 'SafeLane HN',
  tagline: 'Bike sensor rides show where Heilbronn should act first',
  loading: 'Loading data…',
  loadError: 'Could not load the map data.',
  unnamed: 'Unnamed street',
  noScore: 'n/a',
  close: '×',

  popup: {
    separator: ' – ',
  },

  rankList: {
    title: 'Top 10 priority streets',
    colRank: '#',
    colName: 'Street',
    colScore: 'Score',
    colPoints: 'Points',
  },

  factorLabels: {
    safety: 'Close passes',
    danger: 'Danger spots',
    surface: 'Rough surface',
    air: 'Fine dust',
    flow: 'Stop-and-go',
  },

  factorTooltips: {
    safety: 'Share of passing vehicles that came closer than 1.5 m, the legal minimum in town.',
    danger: 'How many very close, risky passes were recorded per 100 m of street.',
    surface: 'How bumpy the ride is, based on how much the bike shakes. Potholes and cobbles score high.',
    air: 'How much fine dust was in the air on this street, compared with the rest of Heilbronn.',
    flow: 'How often riders had to stop and start again, for example at lights or in jams.',
  },

  legend: {
    title: 'Safety priority',
    bands: [
      { label: 'Very low', range: '0–20' },
      { label: 'Low', range: '20–40' },
      { label: 'Medium', range: '40–60' },
      { label: 'High', range: '60–80' },
      { label: 'Very high', range: '80–100' },
    ],
    noData: 'Not enough data',
  },

  methodBox: {
    title: 'How the score works',
    toggle: 'How we score',
    explanation:
      'Local riders cycled Heilbronn with senseBox:bike sensors. For each street section we look at five things: ' +
      'close passes by cars, risky near misses, bumpy surface, fine dust and stop-and-go traffic. Each is compared ' +
      'with the rest of the city, weighted by the sliders and added up to a score from 0 to 100. ' +
      'Higher means: look at this street first.',
    weightsCaption: 'Current weights',
    factorHeader: 'Factor',
    weightHeader: 'Weight',
    limitsTitle: 'What this data cannot tell you',
    limits: [
      'Riders chose their own routes, so popular streets have more data. A street with no data is not safe, just unmeasured.',
      'Passing cars are detected by AI. It misses some and miscounts others, so a single value can be off.',
      'Some streets have only a few measurements. Their scores are less certain, so check the confidence on each card.',
    ],
    dataSource: (generatedAt) => `Data: ATRAI senseBox:bike, generated ${generatedAt}`,
  },

  weightSliders: {
    title: 'What matters most to you?',
    hint: 'Move a slider and the map and top 10 update. The weights always add up to 100%.',
    reset: 'Reset weights',
    sliderLabel: (factor) => `${factor} weight`,
  },

  emptyStates: {
    noSegmentSelected: 'Select a street on the map or in the list to see why it ranks where it does.',
    noEligibleSegments: 'No street has enough measurements for a score yet. More rides will fill the map.',
    noRank: 'This segment has not been ranked.',
    notEnoughMeasurements: 'Not enough measurements to calculate a score.',
  },

  cardLabels: {
    score: 'Priority score',
    measurements: 'Measurements',
    overtakes: 'Overtakes',
    confidence: 'Confidence',
    topReasons: 'Top reasons',
  },
};
