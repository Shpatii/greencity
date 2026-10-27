'use client';
import { memo, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import type { SegmentFeature } from '@/lib/loadData';
import type { Meta, SegmentProps } from '@/lib/types';
import { segmentLabel } from '@/lib/segmentLabel';
import { theme } from '@/content/theme';
import { copy } from '@/content/copy';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// Shown until meta.json arrives; replaced by a fit to meta.bbox on first load.
const INITIAL_VIEW = { center: [9.21, 49.14] as [number, number], zoom: 12 };
const HOVER_DEBOUNCE_MS = 40;
const NO_ID: maplibregl.FilterSpecification = ['==', ['get', 'id'], ''];

export interface MapData {
  segments: SegmentFeature[];
  meta: Meta;
}

interface Props {
  /** null while loading or after a load error; the map stays visible either way. */
  data: MapData | null;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

/**
 * Sources and layers are created once. Hover never touches React state
 * (feature-state + popup only), and selection only calls setFilter, so the
 * only re-renders are on data load and selection change.
 */
function MapView({ data, selectedId, setSelectedId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef(false);
  const layersAddedRef = useRef(false);
  const fittedRef = useRef(false);
  // Latest props for map callbacks, without re-running the init effect.
  const dataRef = useRef(data);
  dataRef.current = data;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const setSelectedIdRef = useRef(setSelectedId);
  setSelectedIdRef.current = setSelectedId;

  const addDataRef = useRef<((d: MapData) => void) | null>(null);

  // ── Init once ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      ...INITIAL_VIEW,
    });
    mapRef.current = map;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'safelane-popup',
    });
    const popupNode = document.createElement('div');
    const popupName = document.createElement('strong');
    const popupScore = document.createElement('span');
    popupNode.append(popupName, popupScore);
    popup.setDOMContent(popupNode);

    let hoveredId: string | null = null;
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;

    const setHovered = (id: string | null) => {
      if (id === hoveredId) return;
      if (hoveredId) map.setFeatureState({ source: 'segments', id: hoveredId }, { hover: false });
      if (id) map.setFeatureState({ source: 'segments', id }, { hover: true });
      hoveredId = id;
    };

    const attachHandlers = () => {
      // Debounced: a fast sweep across many lines only updates for the line the pointer rests on.
      map.on('mousemove', 'segments-hit', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const lngLat = e.lngLat;
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          const props = feature.properties as SegmentProps;
          map.getCanvas().style.cursor = 'pointer';
          if (props.id !== hoveredId) {
            setHovered(props.id);
            popupName.textContent = segmentLabel(props);
            popupScore.textContent =
              copy.popup.separator +
              (props.eligible && props.score != null ? Number(props.score).toFixed(1) : copy.noScore);
          }
          popup.setLngLat(lngLat);
          if (!popup.isOpen()) popup.addTo(map);
        }, HOVER_DEBOUNCE_MS);
      });

      map.on('mouseleave', 'segments-hit', () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = null;
        setHovered(null);
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      map.on('click', 'segments-hit', (e) => {
        const props = e.features?.[0]?.properties as SegmentProps | undefined;
        if (props) setSelectedIdRef.current(props.id);
      });
    };

    addDataRef.current = (d: MapData) => {
      if (!styleReadyRef.current) return; // the 'load' handler picks it up
      if (!layersAddedRef.current) {
        addLayers(map, d.segments);
        attachHandlers();
        layersAddedRef.current = true;
        applySelected(map, selectedIdRef.current, d.segments);
      }
      if (!fittedRef.current) {
        const [minLng, minLat, maxLng, maxLat] = d.meta.bbox;
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, duration: 0 });
        fittedRef.current = true;
      }
    };

    map.on('load', () => {
      styleReadyRef.current = true;
      if (dataRef.current) addDataRef.current?.(dataRef.current);
    });

    return () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      styleReadyRef.current = false;
      layersAddedRef.current = false;
      fittedRef.current = false;
      addDataRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Data arrives (once per successful load) ───────────────────────────────
  useEffect(() => {
    if (data) addDataRef.current?.(data);
  }, [data]);

  // ── Selection → setFilter + flyTo ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersAddedRef.current || !data) return;
    applySelected(map, selectedId, data.segments);
  }, [selectedId, data]);

  // maplibre-gl.css sets .maplibregl-map { position: relative }, which overrides
  // `absolute` on the container itself, so position a wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

export default memo(MapView);

// ── Helpers ──────────────────────────────────────────────────────────────────

function addLayers(map: maplibregl.Map, segments: SegmentFeature[]): void {
  const featureCollection: FeatureCollection = {
    type: 'FeatureCollection',
    features: segments as unknown as FeatureCollection['features'],
  };
  map.addSource('segments', { type: 'geojson', data: featureCollection, promoteId: 'id' });

  const hovered: maplibregl.ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];

  // Not eligible: dashed grey.
  map.addLayer({
    id: 'segments-noData',
    type: 'line',
    source: 'segments',
    filter: ['!', ['get', 'eligible']],
    paint: {
      'line-color': theme.noDataColor,
      'line-width': ['case', hovered, 4, 2] as maplibregl.ExpressionSpecification,
      'line-dasharray': [2, 2],
    },
  });

  // Eligible: interpolated score colour, thicker on hover.
  const colorStops = theme.scoreColors.flatMap(([stop, color]) => [stop, color]);
  map.addLayer({
    id: 'segments-line',
    type: 'line',
    source: 'segments',
    filter: ['get', 'eligible'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'score'], 0], ...colorStops,
      ] as maplibregl.ExpressionSpecification,
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        12, ['case', hovered, 4, 2],
        16, ['case', hovered, 8, 5],
      ] as maplibregl.ExpressionSpecification,
    },
  });

  // Selection highlight: filter is swapped by applySelected, never re-created.
  map.addLayer({
    id: 'segments-highlight-outer',
    type: 'line',
    source: 'segments',
    filter: NO_ID,
    paint: { 'line-color': theme.highlightOuter, 'line-width': 12 },
  });
  map.addLayer({
    id: 'segments-highlight',
    type: 'line',
    source: 'segments',
    filter: NO_ID,
    paint: { 'line-color': theme.highlightInner, 'line-width': 8 },
  });

  // Invisible, wide hit target on top for hover and click.
  map.addLayer({
    id: 'segments-hit',
    type: 'line',
    source: 'segments',
    paint: { 'line-width': 12, 'line-opacity': 0 },
  });
}

function applySelected(map: maplibregl.Map, id: string | null, segments: SegmentFeature[]): void {
  const filter: maplibregl.FilterSpecification = id ? ['==', ['get', 'id'], id] : NO_ID;
  map.setFilter('segments-highlight', filter);
  map.setFilter('segments-highlight-outer', filter);

  if (!id) return;
  const feature = segments.find((f) => f.properties.id === id);
  if (!feature) return;

  const bounds = new maplibregl.LngLatBounds();
  for (const coord of feature.geometry.coordinates) bounds.extend(coord);
  map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 600 });
}
