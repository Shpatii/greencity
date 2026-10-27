/** All user-facing strings. No hard-coded English anywhere else in the app. */
export const copy = {
  appTitle: 'SafeLane HN',
  tagline: 'Bike sensor rides show where Heilbronn should act first',
  loading: 'Loading data…',
  mockBadge: 'MOCK DATA',
  unnamed: 'Unnamed street',
  /** Shown for segments with name = null, followed by the first 3 digits of the id. */
  unnamedStreet: 'Unnamed street',
  /** Small link from the segment card to the way on openstreetmap.org. */
  osmLink: 'OSM',

  loadError: {
    message: 'Data could not be loaded',
    retry: 'Retry',
  },
  noScore: 'n/a',
  close: '×',

  popup: {
    /** Separator between name and score in the map hover popup. */
    separator: ' – ',
  },

  rankList: {
    title: 'Top 10 priority streets',
    colRank: '#',
    colName: 'Street',
    colScore: 'Score',
    colPoints: 'Points',
  },

  segmentCard: {
    scoreLabel: 'Priority score',
    confidenceLabel: 'Confidence',
    nPointsLabel: 'Measurements',
    nOvertakesLabel: 'Overtakes',
    reasonsTitle: 'Key factors',
  },

  emptyStates: {
    noRank: 'This segment has not been ranked.',
    notEnoughMeasurements: 'Not enough measurements to calculate a score.',
    noSegmentSelected: 'Select a street on the map or in the list to see why it ranks where it does.',
    noEligibleSegments: 'No street has enough measurements for a score yet. More rides will fill the map.',
  },
} as const;
