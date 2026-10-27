'use client';
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import type { SegmentFeature } from '@/lib/loadData';
import type { Meta, SegmentProps } from '@/lib/types';
import { theme } from '@/content/theme';
import { copy } from '@/content/copy';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

interface Props {
  segments: SegmentFeature[];
  meta: Meta;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

export default function MapView({ segments, meta, selectedId, setSelectedId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  // Keep latest selectedId accessible inside map callbacks without re-running the init effect
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  // ── Init once ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const [minLng, minLat, maxLng, maxLat] = meta.bbox;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      fitBoundsOptions: { padding: 40 },
    });
    mapRef.current = map;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'safelane-popup',
    });

    map.on('load', () => {
      readyRef.current = true;

      const featureCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: segments as unknown as FeatureCollection['features'],
      };

      map.addSource('segments', {
        type: 'geojson',
        data: featureCollection,
        promoteId: 'id',
      });

      // ── Layer 1: no-data segments (eligible=false) — dashed grey ────────
      map.addLayer({
        id: 'segments-noData',
        type: 'line',
        source: 'segments',
        filter: ['!', ['get', 'eligible']],
        paint: {
          'line-color': theme.noDataColor,
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });

      // ── Layer 2: eligible segments — interpolated score colour ───────────
      const colorStops = theme.scoreColors.flatMap(([stop, color]) => [stop, color]);
      map.addLayer({
        id: 'segments-line',
        type: 'line',
        source: 'segments',
        filter: ['get', 'eligible'],
        paint: {
          'line-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'score'], 0],
            ...colorStops,
          ] as maplibregl.ExpressionSpecification,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 3,
            16, 5,
          ] as maplibregl.ExpressionSpecification,
        },
      });

      // ── Layer 3: selection highlight — outer/border ──────────────────────
      map.addLayer({
        id: 'segments-highlight-outer',
        type: 'line',
        source: 'segments',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'line-color': theme.highlightOuter,
          'line-width': 12,
        },
      });

      // ── Layer 4: selection highlight — inner fill ────────────────────────
      map.addLayer({
        id: 'segments-highlight',
        type: 'line',
        source: 'segments',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'line-color': theme.highlightInner,
          'line-width': 8,
        },
      });

      // ── Layer 5: invisible hit layer on top (12 px wide, opacity 0) ──────
      map.addLayer({
        id: 'segments-hit',
        type: 'line',
        source: 'segments',
        paint: {
          'line-width': 12,
          'line-opacity': 0,
        },
      });

      // Apply any selectedId that arrived before the map was ready
      if (selectedIdRef.current) {
        applySelected(map, selectedIdRef.current, segments);
      }

      // ── Hover: cursor + popup ────────────────────────────────────────────
      map.on('mousemove', 'segments-hit', (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties as SegmentProps;
        const name = props.name ?? copy.unnamed;
        const score =
          props.eligible && props.score != null
            ? Number(props.score).toFixed(1)
            : copy.noScore;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${name}</strong>${copy.popup.separator}${score}`)
          .addTo(map);
      });

      map.on('mouseleave', 'segments-hit', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      // ── Click: select segment ────────────────────────────────────────────
      map.on('click', 'segments-hit', (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties as SegmentProps;
        setSelectedId(props.id);
      });
    });

    return () => {
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync selectedId → map (filter + flyTo) ────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function applySelected(
  map: maplibregl.Map,
  id: string | null,
  segments: SegmentFeature[],
): void {
  const filter: maplibregl.FilterSpecification = id
    ? ['==', ['get', 'id'], id]
    : ['==', ['get', 'id'], ''];

  map.setFilter('segments-highlight', filter);
  map.setFilter('segments-highlight-outer', filter);

  if (!id) return;

  const feature = segments.find((f) => f.properties.id === id);
  if (!feature) return;

  const coords = feature.geometry.coordinates;
  const [lng, lat] = coords[Math.floor(coords.length / 2)];
  map.flyTo({ center: [lng, lat], zoom: 16 });
}
