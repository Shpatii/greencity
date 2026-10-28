'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { CounterCollection, CounterProps, SegmentCollection, SegmentFeature } from '@/lib/loadData';
import type { RankedSegment } from '@/lib/score';
import type { Meta, SegmentProps } from '@/lib/types';
import {
  counterColors,
  dimmedOpacity,
  lineCasingColor,
  noDataColor,
  scoreBreaks,
  scoreColors,
  selectionColors,
} from '@/content/theme';
import { copy } from '@/content/copy';

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
// If the CARTO style can't be fetched, 'load' never fires and the segments never get added.
// Fall back to a plain background so the data still shows.
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0b0b0c' } }],
};
const STYLE_TIMEOUT_MS = 8000;
const CENTER: [number, number] = [9.2109, 49.1427];
const ZOOM = 13;

// maplibre v6 resolves its worker relative to its own module URL, which webpack breaks.
// `npm run copy-worker` (runs before dev/build) puts it in public/.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const LINE_WIDTH: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 12, 2, 14, 3, 16, 5];
const CASING_WIDTH: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 12, 3.5, 14, 4.5, 16, 7];

// Slider weights set feature-state liveScore; before that the published score is used.
const LIVE_SCORE: maplibregl.ExpressionSpecification = ['coalesce', ['feature-state', 'liveScore'], ['get', 'score']];

// Same bands as the legend: step through scoreBreaks.
const SCORE_COLOR: maplibregl.ExpressionSpecification = [
  'step',
  ['coalesce', LIVE_SCORE, 0],
  scoreColors[0],
  ...scoreBreaks.flatMap((b, i) => [b, scoreColors[i + 1]]),
];

const NO_MATCH: maplibregl.FilterSpecification = ['==', ['get', 'id'], ''];

// "Show only infrastructure gaps": non-gap segments fade out (paint only, no data upload).
const SEGMENT_LAYERS = ['segments-noData', 'segments-casing', 'segments-line'] as const;
const IS_GAP: maplibregl.ExpressionSpecification = ['==', ['get', 'infra_gap'], true];
const GAP_OPACITY: maplibregl.ExpressionSpecification = ['case', IS_GAP, 1, dimmedOpacity];

// Soft glow under high and very high priority streets (live score, so it follows the sliders).
const GLOW_FROM = scoreBreaks[2];
const GLOW_OPACITY: maplibregl.ExpressionSpecification = ['case', ['>=', ['coalesce', LIVE_SCORE, 0], GLOW_FROM], 0.45, 0];
const GLOW_OPACITY_GAPS: maplibregl.ExpressionSpecification = [
  'case', ['all', IS_GAP, ['>=', ['coalesce', LIVE_SCORE, 0], GLOW_FROM]], 0.45, 0,
];
const GLOW_WIDTH: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 12, 6, 14, 10, 16, 16];

// Higher scores draw on top, so a high-priority street is never hidden under an overlapping line.
// Layout properties can't read feature-state, so this stays on the published score.
const SORT_BY_SCORE: maplibregl.DataDrivenPropertyValueSpecification<number> = ['coalesce', ['get', 'score'], -1];

function liveScore(f: maplibregl.MapGeoJSONFeature): number | null {
  return (f.state?.liveScore as number | undefined) ?? (f.properties.score as number | null);
}

/** Under the cursor, the line with the highest score wins (matches the draw order). */
function pickTop(features: maplibregl.MapGeoJSONFeature[]): maplibregl.MapGeoJSONFeature {
  const score = (f: maplibregl.MapGeoJSONFeature) => liveScore(f) ?? -1;
  return features.reduce((best, f) => (score(f) > score(best) ? f : best));
}

interface Props {
  /** Loaded once; weight changes come in through `ranking`, not new features. */
  segments: SegmentFeature[];
  /** Live scores from rankSegments() for the current weights. */
  ranking: RankedSegment[];
  /** Called after a recolour: time spent in setFeatureState, and until the next frame was drawn. */
  onRecoloured?: (stateMs: number, paintMs: number) => void;
  /** Fade segments that are not infra_gap (contract 3.2b). */
  dimNonGaps?: boolean;
  /** Bike counter points (optional layer) and whether to show them. */
  counters?: CounterCollection | null;
  showCounters?: boolean;
  meta: Meta;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  /** Space covered by floating panels, so fitting and flying keep the streets in view. */
  inset?: maplibregl.PaddingOptions;
}

function toCollection(segments: SegmentFeature[]): SegmentCollection {
  return { type: 'FeatureCollection', features: segments };
}

export default function MapView({
  segments, ranking, onRecoloured, dimNonGaps = false, counters = null, showCounters = false,
  meta, selectedId, setSelectedId, inset,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  // Latest props for map callbacks, without re-running the init effect.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const rankingRef = useRef(ranking);
  rankingRef.current = ranking;
  const onRecolouredRef = useRef(onRecoloured);
  onRecolouredRef.current = onRecoloured;
  const layersRef = useRef({ dimNonGaps, counters, showCounters });
  layersRef.current = { dimNonGaps, counters, showCounters };
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
      attributionControl: { compact: true },
    });
    if (inset) map.setPadding(inset);
    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    mapRef.current = map;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'safelane-popup' });

    // The style request can fail (error event) or just hang (no event at all); handle both.
    let styleArrived = false;
    let usedFallback = false;
    const switchToFallback = (reason: unknown) => {
      if (readyRef.current || styleArrived || usedFallback) return;
      console.warn('Basemap style did not load, using a plain background.', reason);
      usedFallback = true;
      map.setStyle(FALLBACK_STYLE);
    };
    map.once('styledata', () => { styleArrived = true; });
    map.on('error', (e) => {
      // Only the style request itself; a failed tile or sprite is not a reason to drop the basemap.
      if ((e.error as { url?: string } | undefined)?.url === STYLE_URL) switchToFallback(e.error);
    });
    const styleTimeout = setTimeout(() => switchToFallback('timeout'), STYLE_TIMEOUT_MS);

    map.on('load', () => {
      readyRef.current = true;

      map.addSource('segments', {
        type: 'geojson',
        data: toCollection(segmentsRef.current),
        promoteId: 'id',
        // The segment geometry and the OSM fields come from OpenStreetMap.
        attribution: meta.attribution ?? copy.osmAttribution,
      });

      // Not enough data: dashed grey.
      map.addLayer({
        id: 'segments-noData',
        type: 'line',
        source: 'segments',
        filter: ['!', ['get', 'eligible']],
        paint: { 'line-color': noDataColor, 'line-width': 2, 'line-dasharray': [2, 2] },
      });

      map.addLayer({
        id: 'segments-glow',
        type: 'line',
        source: 'segments',
        filter: ['get', 'eligible'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': SCORE_COLOR, 'line-width': GLOW_WIDTH, 'line-blur': 6, 'line-opacity': GLOW_OPACITY },
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

      map.fitBounds(meta.bbox, { padding: 16, duration: 0 });

      applyLiveScores(map, rankingRef.current);
      applyDim(map, layersRef.current.dimNonGaps);
      applyCounters(map, layersRef.current.counters, layersRef.current.showCounters);

      if (selectedIdRef.current) applySelected(map, selectedIdRef.current, segmentsRef.current);

      // A counter point under the cursor wins over the segments below it.
      const onCounter = (point: maplibregl.PointLike) =>
        !!map.getLayer('counters') && map.queryRenderedFeatures(point, { layers: ['counters'] }).length > 0;

      map.on('mousemove', 'segments-hit', (e) => {
        if (!e.features?.length || onCounter(e.point)) return;
        map.getCanvas().style.cursor = 'pointer';
        const top = pickTop(e.features);
        const p = top.properties as SegmentProps;
        const s = liveScore(top);
        const score = p.eligible && s != null ? Number(s).toFixed(1) : copy.noScore;
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

      const showCounterPopup = (e: maplibregl.MapLayerMouseEvent) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties as CounterProps;
        const content = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = p.name;
        const bikes = document.createElement('div');
        bikes.textContent = copy.counters.perDay(new Intl.NumberFormat('en-US').format(p.avg_daily_bikes));
        const source = document.createElement('div');
        source.className = 'text-xs text-neutral-400';
        source.textContent = copy.counters.source;
        content.append(name, bikes, source);
        popup.setLngLat(e.lngLat).setDOMContent(content).addTo(map);
      };
      map.on('mousemove', 'counters', showCounterPopup);
      map.on('click', 'counters', showCounterPopup);
      map.on('mouseleave', 'counters', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      map.on('click', 'segments-hit', (e) => {
        if (!e.features?.length || onCounter(e.point)) return;
        setSelectedId((pickTop(e.features).properties as SegmentProps).id);
      });
    });

    return () => {
      clearTimeout(styleTimeout);
      readyRef.current = false;
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New features (only when the data loads). Weight changes don't come through here.
  useEffect(() => {
    const source = mapRef.current?.getSource('segments') as maplibregl.GeoJSONSource | undefined;
    source?.setData(toCollection(segments));
  }, [segments]);

  // Recolour for new weights via feature-state, without re-uploading the GeoJSON.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const t0 = performance.now();
    applyLiveScores(map, ranking);
    const stateMs = performance.now() - t0;
    map.once('render', () => onRecolouredRef.current?.(stateMs, performance.now() - t0));
  }, [ranking]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) applyDim(map, dimNonGaps);
  }, [dimNonGaps]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) applyCounters(map, counters, showCounters);
  }, [counters, showCounters]);

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

function applyDim(map: maplibregl.Map, dim: boolean): void {
  for (const id of SEGMENT_LAYERS) map.setPaintProperty(id, 'line-opacity', dim ? GAP_OPACITY : 1);
  map.setPaintProperty('segments-glow', 'line-opacity', dim ? GLOW_OPACITY_GAPS : GLOW_OPACITY);
}

/** Add the counter source/layer once data is there, then toggle its visibility. */
function applyCounters(map: maplibregl.Map, counters: CounterCollection | null, show: boolean): void {
  if (!counters) return;
  if (!map.getSource('counters')) {
    map.addSource('counters', { type: 'geojson', data: counters, attribution: copy.counters.attribution });
    map.addLayer({
      id: 'counters',
      type: 'circle',
      source: 'counters',
      paint: {
        'circle-color': counterColors.fill,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 15, 8],
        'circle-stroke-color': counterColors.stroke,
        'circle-stroke-width': 2,
      },
    });
  }
  map.setLayoutProperty('counters', 'visibility', show ? 'visible' : 'none');
}

function applyLiveScores(map: maplibregl.Map, ranking: RankedSegment[]): void {
  for (const r of ranking) {
    if (r.rank !== null) map.setFeatureState({ source: 'segments', id: r.id }, { liveScore: r.score });
  }
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
