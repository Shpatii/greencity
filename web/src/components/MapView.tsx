'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { SegmentCollection, SegmentFeature } from '@/lib/loadData';
import type { Meta, SegmentProps } from '@/lib/types';
import {
  lineCasingColor,
  noDataColor,
  scoreBreaks,
  scoreColors,
  selectionColors,
} from '@/content/theme';
import { copy } from '@/content/copy';

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const CENTER: [number, number] = [9.2109, 49.1427];
const ZOOM = 13;

// maplibre v6 resolves its worker relative to its own module URL, which webpack breaks.
// `npm run copy-worker` (runs before dev/build) puts it in public/.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const LINE_WIDTH: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 12, 2, 14, 3, 16, 5];
const CASING_WIDTH: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 12, 3.5, 14, 4.5, 16, 7];

// Same bands as the legend: step through scoreBreaks.
const SCORE_COLOR: maplibregl.ExpressionSpecification = [
  'step',
  ['coalesce', ['get', 'score'], 0],
  scoreColors[0],
  ...scoreBreaks.flatMap((b, i) => [b, scoreColors[i + 1]]),
];

const NO_MATCH: maplibregl.FilterSpecification = ['==', ['get', 'id'], ''];

// Higher scores draw on top, so a high-priority street is never hidden under an overlapping line.
const SORT_BY_SCORE: maplibregl.DataDrivenPropertyValueSpecification<number> = ['coalesce', ['get', 'score'], -1];

/** Under the cursor, the line with the highest score wins (matches the draw order). */
function pickTop(features: maplibregl.MapGeoJSONFeature[]): SegmentProps {
  const score = (f: maplibregl.MapGeoJSONFeature) => Number(f.properties.score ?? -1);
  return features.reduce((best, f) => (score(f) > score(best) ? f : best)).properties as SegmentProps;
}

interface Props {
  segments: SegmentFeature[];
  meta: Meta;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

function toCollection(segments: SegmentFeature[]): SegmentCollection {
  return { type: 'FeatureCollection', features: segments };
}

export default function MapView({ segments, meta, selectedId, setSelectedId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  // Latest props for map callbacks, without re-running the init effect.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: CENTER,
      zoom: ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'safelane-popup' });

    map.on('load', () => {
      readyRef.current = true;

      map.addSource('segments', { type: 'geojson', data: toCollection(segmentsRef.current), promoteId: 'id' });

      // Not enough data: dashed grey.
      map.addLayer({
        id: 'segments-noData',
        type: 'line',
        source: 'segments',
        filter: ['!', ['get', 'eligible']],
        paint: { 'line-color': noDataColor, 'line-width': 2, 'line-dasharray': [2, 2] },
      });

      // Eligible: dark casing, then the band colour on top.
      map.addLayer({
        id: 'segments-casing',
        type: 'line',
        source: 'segments',
        filter: ['get', 'eligible'],
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': SORT_BY_SCORE },
        paint: { 'line-color': lineCasingColor, 'line-width': CASING_WIDTH },
      });
      map.addLayer({
        id: 'segments-line',
        type: 'line',
        source: 'segments',
        filter: ['get', 'eligible'],
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': SORT_BY_SCORE },
        paint: { 'line-color': SCORE_COLOR, 'line-width': LINE_WIDTH },
      });

      // Selected street: halo + line.
      map.addLayer({
        id: 'segments-highlight-outer',
        type: 'line',
        source: 'segments',
        filter: NO_MATCH,
        paint: { 'line-color': selectionColors.halo, 'line-width': 12 },
      });
      map.addLayer({
        id: 'segments-highlight',
        type: 'line',
        source: 'segments',
        filter: NO_MATCH,
        paint: { 'line-color': selectionColors.line, 'line-width': 8 },
      });

      // Invisible, wider hit layer on top so thin lines are easy to hover and click.
      map.addLayer({
        id: 'segments-hit',
        type: 'line',
        source: 'segments',
        layout: { 'line-sort-key': SORT_BY_SCORE },
        paint: { 'line-width': 12, 'line-opacity': 0 },
      });

      map.fitBounds(meta.bbox, { padding: 24, duration: 0 });

      if (selectedIdRef.current) applySelected(map, selectedIdRef.current, segmentsRef.current);

      map.on('mousemove', 'segments-hit', (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const p = pickTop(e.features);
        const score = p.eligible && p.score != null ? Number(p.score).toFixed(1) : copy.noScore;
        // Build the popup with text nodes: street names come from data, never inject them as HTML.
        const content = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = p.name ?? copy.unnamed;
        content.append(name, `${copy.popup.separator}${score}`);
        popup.setLngLat(e.lngLat).setDOMContent(content).addTo(map);
      });

      map.on('mouseleave', 'segments-hit', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      map.on('click', 'segments-hit', (e) => {
        if (!e.features?.length) return;
        setSelectedId(pickTop(e.features).id);
      });
    });

    return () => {
      readyRef.current = false;
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new data (e.g. re-scored by the sliders) into the existing source.
  useEffect(() => {
    const source = mapRef.current?.getSource('segments') as maplibregl.GeoJSONSource | undefined;
    source?.setData(toCollection(segments));
  }, [segments]);

  // Sync selectedId → highlight filter + fly to the street.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    applySelected(map, selectedId, segments);
  }, [selectedId, segments]);

  // maplibre-gl.css sets .maplibregl-map { position: relative }, which overrides
  // `absolute` on the container itself, so position a wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function applySelected(map: maplibregl.Map, id: string | null, segments: SegmentFeature[]): void {
  const filter: maplibregl.FilterSpecification = id ? ['==', ['get', 'id'], id] : NO_MATCH;
  map.setFilter('segments-highlight', filter);
  map.setFilter('segments-highlight-outer', filter);

  if (!id) return;
  const feature = segments.find((f) => f.properties.id === id);
  if (!feature) return;
  const coords = feature.geometry.coordinates;
  const [lng, lat] = coords[Math.floor(coords.length / 2)];
  map.flyTo({ center: [lng, lat], zoom: 16 });
}
