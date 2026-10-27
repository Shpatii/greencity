/** All user-facing strings. No hard-coded English anywhere else in the app. */
export const copy = {
  loading: 'Loading data…',
  mockBadge: 'MOCK DATA',
  unnamed: 'Unnamed street',
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
  },
} as const;
