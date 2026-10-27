'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadData } from '@/lib/loadData';
import MapView from '@/components/MapView';
import type { MapData } from '@/components/MapView';
import Legend from '@/components/Legend';
import MethodBox from '@/components/MethodBox';
import RankList from '@/components/RankList';
import SegmentCard from '@/components/SegmentCard';
import { copy } from '@/content/copy';

type Status = 'loading' | 'error' | 'ready';

const MOBILE_QUERY = '(max-width: 767px)';

export default function Page() {
  const [data, setData] = useState<MapData | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    loadData()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const byId = useMemo(
    () => new Map((data?.segments ?? []).map((f) => [f.properties.id, f])),
    [data],
  );
  const selectedSegment = selectedId ? byId.get(selectedId) ?? null : null;

  // On mobile the list sits below the map: scroll up so the map can show the selection.
  const selectFromList = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id && window.matchMedia(MOBILE_QUERY).matches) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col md:h-screen md:flex-row">
      {/* Map: 55vh on top on mobile, 65% width on desktop. Always mounted, also while loading. */}
      <div className="relative h-[55vh] w-full flex-shrink-0 md:h-full md:w-[65%]">
        <MapView data={data} selectedId={selectedId} setSelectedId={setSelectedId} />
      </div>

      <aside className="w-full bg-white md:h-full md:w-[35%] md:overflow-y-auto md:border-l md:border-gray-200">
        <header className="border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-gray-900">{copy.appTitle}</h1>
            {data?.meta.source === 'mock' && (
              <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-bold tracking-wide text-amber-900">
                {copy.mockBadge}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">{copy.tagline}</p>
        </header>

        <div className="space-y-3 p-3">
          <Legend />

          {status === 'loading' && <SidebarSkeleton />}

          {status === 'error' && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm">
              <p className="mb-3 font-medium text-red-800">{copy.loadError.message}</p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="min-h-[44px] rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 md:min-h-0 md:py-1.5"
              >
                {copy.loadError.retry}
              </button>
            </div>
          )}

          {status === 'ready' && data && (
            <>
              <RankList segments={data.segments} selectedId={selectedId} setSelectedId={selectFromList} />

              {/* Desktop: card in the sidebar flow. Mobile: bottom sheet over the list. */}
              {selectedSegment ? (
                <div className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.18)] md:static md:z-auto md:max-h-none md:overflow-visible md:rounded-none md:shadow-none">
                  <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300 md:hidden" aria-hidden />
                  <SegmentCard
                    segment={selectedSegment}
                    meta={data.meta}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              ) : (
                <p className="hidden rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 md:block">
                  {copy.emptyStates.noSegmentSelected}
                </p>
              )}
            </>
          )}

          <MethodBox />
        </div>
      </aside>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div aria-busy="true" aria-label={copy.loading} className="space-y-3">
      <div className="animate-pulse rounded-xl bg-white p-4 shadow">
        <div className="mb-4 h-4 w-40 rounded bg-gray-200" />
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="mb-2 flex items-center gap-3">
            <div className="h-3 w-4 rounded bg-gray-200" />
            <div className="h-3 flex-1 rounded bg-gray-200" />
            <div className="h-3 w-8 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-gray-200" />
      <span className="sr-only">{copy.loading}</span>
    </div>
  );
}
