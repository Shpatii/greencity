// P4: all user-facing text.
// TODO(de): add German copy as `copyDe: Copy` and pick by locale.
import type { FactorKey, InfraClass } from '@/lib/types';
import type { PresetKey } from '@/lib/weights';

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
    /** Shown for 2 s next to the title after the #1 street changes. */
    changed: string;
    /** Empty list while "Show only infrastructure gaps" is on. */
    noGaps: string;
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
    countersSource: string;
  };
  embed: {
    listTitle: string;
    /** Link from the embed to the full app, opens outside the iframe. */
    openFull: string;
  };
  downloads: {
    csv: string;
    /** Link to web/public/report.pdf (pipeline: python run.py --report --publish). */
    pdf: string;
    pdfHint: string;
  };
  csv: {
    /** Column headers of the CSV export, in order. */
    header: readonly string[];
  };
  weightSliders: {
    title: string;
    hint: string;
    reset: string;
    /** Screen-reader label for one slider, e.g. "Close passes weight". */
    sliderLabel: (factor: string) => string;
    presetsLabel: string;
    presets: Record<PresetKey, string>;
  };
  emptyStates: {
    noSegmentSelected: string;
    noEligibleSegments: string;
    noRank: string;
    notEnoughMeasurements: string;
  };
  /** © line for the segment data on the map (meta.attribution wins when present). */
  osmAttribution: string;
  infraLabels: Record<InfraClass, string>;
  layers: {
    title: string;
    gapsOnly: string;
    gapsHint: string;
    counters: string;
  };
  counters: {
    /** Map attribution while the counter layer is shown. */
    attribution: string;
    perDay: (bikes: string) => string;
    source: string;
  };
  cardLabels: {
    infrastructure: string;
    speedLimit: string;
    speedKmh: (kmh: number) => string;
    speedUnknown: string;
    suggestedMeasure: string;
    score: string;
    measurements: string;
    overtakes: string;
    confidence: string;
    topReasons: string;
  };
  nav: {
    overview: string;
    map: string;
    method: string;
    openMap: string;
  };
  landing: {
    eyebrow: string;
    headline: readonly [string, string];
    intro: string;
    ctaPrimary: string;
    ctaSecondary: string;
    heroCaption: string;
    statsTitle: string;
    stats: {
      closeShare: string;
      overtakes: string;
      measured: string;
      ranked: string;
    };
    signalsTitle: string;
    signalsIntro: string;
    weightLabel: string;
    topTitle: string;
    topIntro: string;
    rankLabel: (rank: number) => string;
    seeOnMap: string;
    seeAll: string;
    finalTitle: string;
    finalIntro: string;
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
    changed: 'Ranking changed',
    noGaps: 'No street in the top 25% lacks protected bike infrastructure.',
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
    countersSource: 'Bike counters: MobiData BW, Eco-Counter Fahrradzählstellen, Datenlizenz Deutschland – Namensnennung – Version 2.0.',
  },

  embed: {
    listTitle: 'Top 5 priority streets',
    openFull: 'Open full map ↗',
  },

  downloads: {
    csv: 'Download CSV',
    pdf: 'Printable priority list (PDF)',
    pdfHint: 'Top 20 with the default weights',
  },

  csv: {
    header: [
      'Rank', 'Street', 'OSM ID', 'Score', 'Confidence', 'Measurements',
      'Overtakes closer than 150 cm (%)', 'Top reason',
    ],
  },

  weightSliders: {
    title: 'What matters most to you?',
    hint: 'Move a slider and the map and top 10 update. The weights always add up to 100%.',
    reset: 'Reset weights',
    sliderLabel: (factor) => `${factor} weight`,
    presetsLabel: 'Presets',
    presets: { safetyFirst: 'Safety first', comfort: 'Comfort', cleanAir: 'Clean air' },
  },

  emptyStates: {
    noSegmentSelected: 'Select a street on the map or in the list to see why it ranks where it does.',
    noEligibleSegments: 'No street has enough measurements for a score yet. More rides will fill the map.',
    noRank: 'This segment has not been ranked.',
    notEnoughMeasurements: 'Not enough measurements to calculate a score.',
  },

  osmAttribution: '© OpenStreetMap contributors',
  infraLabels: {
    separated: 'Separated',
    bike_street: 'Bike street',
    painted_lane: 'Painted lane',
    shared_bus: 'Shared bus lane',
    shared: 'Shared',
    none: 'No bike infrastructure',
  },
  layers: {
    title: 'Map layers',
    gapsOnly: 'Show only infrastructure gaps',
    gapsHint: 'Top 25% streets (default weights) with no, shared or only painted bike lanes.',
    counters: 'Bike counters',
  },
  counters: {
    attribution: 'Bike counters: MobiData BW, DL-DE-BY-2.0',
    perDay: (bikes) => `${bikes} bikes per day (average, last 365 days)`,
    source: 'Source: MobiData BW, Eco-Counter',
  },

  cardLabels: {
    infrastructure: 'Infrastructure',
    speedLimit: 'Speed limit',
    speedKmh: (kmh) => `${kmh} km/h`,
    speedUnknown: 'unknown',
    suggestedMeasure: 'Suggested measure',
    score: 'Priority score',
    measurements: 'Measurements',
    overtakes: 'Overtakes',
    confidence: 'Confidence',
    topReasons: 'Top reasons',
  },

  nav: {
    overview: 'Overview',
    map: 'Map',
    method: 'How it works',
    openMap: 'Open map',
  },

  landing: {
    eyebrow: 'Heilbronn · senseBox:bike',
    headline: ['Every close pass.', 'On the map.'],
    intro:
      'Sensors on local bikes recorded how close cars came, how rough the road felt and how clean the air was. ' +
      'SafeLane HN turns those rides into a list of streets to fix first.',
    ctaPrimary: 'Open the map',
    ctaSecondary: 'How it works',
    heroCaption: 'Every line is a measured street section. Brighter means higher priority.',
    statsTitle: 'What the riders measured.',
    stats: {
      closeShare: 'of recorded overtakes came closer than 1.5 m',
      overtakes: 'overtakes recorded',
      measured: 'street sections with data',
      ranked: 'sections with enough data to rank',
    },
    signalsTitle: 'Five signals. One score.',
    signalsIntro:
      'Each street section is compared with the rest of the city on five signals, weighted, and added up to a score from 0 to 100.',
    weightLabel: 'weight',
    topTitle: 'Where to act first.',
    topIntro: 'The three street sections with the highest priority right now.',
    rankLabel: (rank) => `No. ${rank}`,
    seeOnMap: 'See on map',
    seeAll: 'See the full ranking',
    finalTitle: 'See your street.',
    finalIntro: 'Zoom in, tap a street, and see why it ranks where it does.',
  },
};
