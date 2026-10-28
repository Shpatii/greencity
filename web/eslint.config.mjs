import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    // React Compiler rules (eslint-plugin-react-hooks 7, new with Next 16). The app does not use the
    // compiler and relies on patterns these rules reject on purpose: latest-props refs read by map
    // callbacks (MapView), timing the re-rank in useMemo, and setState on mount from the URL.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  { ignores: ['.next/', 'out/', 'next-env.d.ts', 'public/maplibre-gl-worker.mjs'] },
];

export default config;
