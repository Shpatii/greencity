'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { SegmentCollection } from '@/lib/loadData';
import type { Meta } from '@/lib/types';

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const CENTER: [number, number] = [9.2109, 49.1427];
const ZOOM = 13;

// maplibre v6 resolves its worker relative to its own module URL, which webpack breaks.
// `npm run copy-worker` (runs before dev/build) puts it in public/.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

interface Props {
  segments: SegmentCollection;
  bbox?: Meta['bbox'];
}

export default function MapView({ segments, bbox }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: CENTER,
      zoom: ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => {
      map.addSource('segments', { type: 'geojson', data: segmentsRef.current });
      map.addLayer({
        id: 'segments-line',
        type: 'line',
        source: 'segments',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': 3, 'line-color': '#888' },
      });
      if (bbox) map.fitBounds(bbox, { padding: 24, duration: 0 });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new data into the existing source.
  useEffect(() => {
    const source = mapRef.current?.getSource('segments') as maplibregl.GeoJSONSource | undefined;
    source?.setData(segments);
  }, [segments]);

  return <div ref={containerRef} className="h-full w-full" />;
}
