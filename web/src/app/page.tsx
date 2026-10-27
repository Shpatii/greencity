'use client';
import { useState, useEffect } from 'react';
import { loadData } from '@/lib/loadData';
import type { SegmentFeature } from '@/lib/loadData';
import type { Meta } from '@/lib/types';
import MapView from '@/components/MapView';
import RankList from '@/components/RankList';
import SegmentCard from '@/components/SegmentCard';
import { copy } from '@/content/copy';

export default function Page() {
  const [segments, setSegments] = useState<SegmentFeature[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadData().then(({ segments, meta }) => {
      setSegments(segments);
      setMeta(meta);
    });
  }, []);

  const selectedSegment = segments.find((f) => f.properties.id === selectedId) ?? null;

  if (!meta || segments.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        {copy.loading}
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Base map — fills entire viewport */}
      <MapView
        segments={segments}
        meta={meta}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
      />

      {/* Mock-data badge */}
      {meta.source === 'mock' && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded bg-amber-400 px-3 py-1 text-xs font-bold tracking-wide text-amber-900">
          {copy.mockBadge}
        </div>
      )}

      {/* Left panel: top-10 rank list */}
      <div className="absolute left-3 top-3 z-10 w-72">
        <RankList
          segments={segments}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
      </div>

      {/* Right panel: segment detail card */}
      {selectedSegment && (
        <div className="absolute right-3 top-3 z-10 w-80">
          <SegmentCard
            segment={selectedSegment}
            meta={meta}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}
