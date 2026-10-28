// Imprint (§ 5 DDG) and privacy notice (Art. 13 GDPR).
// TODO(operator): fill in every null before the site goes public; until then the pages show a
// visible placeholder. Have the final texts checked by whoever is legally responsible for the site.

export interface Operator {
  /** Person, company or authority that runs the site. */
  name: string | null;
  address: readonly string[] | null;
  email: string | null;
  phone: string | null;
  /** Legal representative (company or public body), if any. */
  representedBy: string | null;
  /** Responsible for content under § 18 (2) MStV. */
  contentResponsible: string | null;
  /** Hosting provider that serves the files and keeps access logs, e.g. "Vercel Inc., USA". */
  host: string | null;
  /** How long the host keeps access logs. */
  logRetention: string | null;
}

export const operator: Operator = {
  name: null,
  address: null,
  email: null,
  phone: null,
  representedBy: null,
  contentResponsible: null,
  host: null,
  logRetention: null,
};

export const legalCopy = {
  missing: (field: string) => `[${field}: to be completed by the operator]`,
  links: { imprint: 'Imprint', privacy: 'Privacy' },
  imprint: {
    title: 'Imprint',
    providerTitle: 'Provider (§ 5 DDG)',
    contactTitle: 'Contact',
    representedBy: 'Represented by',
    contentTitle: 'Responsible for content (§ 18 (2) MStV)',
    sourcesTitle: 'Data sources and licences',
    sources: [
      'Bike sensor rides: ATRAI senseBox:bike, Heilbronn campaign (api.atrai.bike).',
      'Streets and bike infrastructure: © OpenStreetMap contributors, Open Database License (ODbL).',
      'Base map: © OpenStreetMap contributors (ODbL), rendered with Protomaps.',
      'Bike counters: MobiData BW, Eco-Counter, Datenlizenz Deutschland – Namensnennung – Version 2.0.',
    ],
    disclaimerTitle: 'About the priority score',
    disclaimer:
      'The priority score is calculated from rides that volunteers recorded with bike sensors. It helps decide ' +
      'where to look first; it is not an official safety assessment, and a street without data is unmeasured, ' +
      'not safe. The method and its limits are explained under "How we score" on the map.',
  },
  privacy: {
    title: 'Privacy',
    controllerTitle: 'Who is responsible',
    visitTitle: 'What happens when you visit this site',
    visit: (host: string, retention: string) =>
      `This is a static website: every page, map tile, font and data file is served from this site. To deliver ` +
      `them, the hosting provider (${host}) processes your IP address, the date and time, the requested file, the ` +
      `referring page and your browser's user agent in its access logs. This is needed to deliver the site and keep ` +
      `it secure (Art. 6 (1) (f) GDPR). The logs are kept for ${retention}.`,
    noTrackingTitle: 'No cookies, no tracking',
    noTracking:
      'The site sets no cookies, stores nothing in your browser, uses no analytics or tracking, and loads nothing ' +
      'from third parties. Map filters and slider settings exist only in the open page.',
    embedTitle: 'Embedded in other sites',
    embed:
      'Other sites, such as the Green City Dashboard, may show the map in a frame. Their own privacy notice ' +
      'applies to what they do.',
    rightsTitle: 'Your rights',
    rights:
      'You have the right to access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of ' +
      'processing (Art. 18) and to object (Art. 21). You can also complain to a data protection authority, for ' +
      'example the Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg.',
  },
} as const;
