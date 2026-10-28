import type { ReactNode } from 'react';
import type { SegmentFeature } from '@/lib/loadData';
import type { Meta, Weights } from '@/lib/types';
import { topReasons } from '@/lib/stats';
import { copy } from '@/content/copy';
import { colorForScore, infraColors } from '@/content/theme';

interface Props {
  segment: SegmentFeature;
  meta: Meta;
  /** Current slider weights; defaults to meta.default_weights. */
  weights?: Weights;
  onClose: () => void;
}

export default function SegmentCard({ segment, meta, weights, onClose }: Props) {
  const p = segment.properties;
  const name = p.name ?? copy.unnamed;

  if (!p.eligible) {
    return (
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <Header name={name} onClose={onClose} />
        <div className="space-y-1 px-4 py-4 text-sm text-gray-600">
          <p>{copy.emptyStates.noRank}</p>
          <p>{copy.emptyStates.notEnoughMeasurements}</p>
        </div>
      </section>
    );
  }

  const reasons = topReasons(p, weights ?? meta.default_weights, 3);

  const score = p.score ?? 0;
  const bandColor = colorForScore(score);

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <Header name={name} onClose={onClose} />

      <div className="px-4 py-4">
        {/* Score — large display; the chip carries the band colour, the text stays dark for contrast */}
        <div className="mb-4 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 rounded-sm ring-1 ring-inset ring-black/40"
            style={{ backgroundColor: bandColor }}
          />
          <span className="text-4xl font-bold tabular-nums text-gray-900">{score.toFixed(1)}</span>
          <span className="text-sm text-gray-600">{copy.cardLabels.score}</span>
        </div>

        <Infrastructure segment={p} />

        {/* Stats grid */}
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Stat label={copy.cardLabels.confidence}>
            {(p.confidence * 100).toFixed(0)}%
          </Stat>
          <Stat label={copy.cardLabels.measurements}>{p.n_points}</Stat>
          <Stat label={copy.cardLabels.overtakes}>{p.n_overtakes}</Stat>
        </dl>

        {/* Reason texts */}
        {reasons.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              {copy.cardLabels.topReasons}
            </p>
            <ul className="space-y-1.5">
              {reasons.map(({ key, text }) => (
                <li key={key} className="text-sm leading-snug text-gray-800">
                  {text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Contract 3.2b: OSM infrastructure and suggested measure; hidden for data without these fields. */
function Infrastructure({ segment: p }: { segment: SegmentFeature['properties'] }) {
  const text = copy.cardLabels;
  const infra = p.infra_class;
  if (!infra && !p.suggested_measure) return null;
  return (
    <div className="mb-4 space-y-2">
      {infra && (
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center gap-2">
            <dt className="sr-only">{text.infrastructure}</dt>
            <dd
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: infraColors[infra].bg, color: infraColors[infra].text }}
            >
              {copy.infraLabels[infra]}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="text-gray-600">{text.speedLimit}:</dt>
            <dd className="font-medium tabular-nums text-gray-800">
              {p.maxspeed_kmh != null ? text.speedKmh(p.maxspeed_kmh) : text.speedUnknown}
            </dd>
          </div>
        </dl>
      )}
      {p.suggested_measure && (
        <p className="rounded-lg border-l-4 border-blue-700 bg-blue-50 px-3 py-2 text-sm text-gray-900">
          <span className="font-semibold">{text.suggestedMeasure}:</span> {p.suggested_measure}
        </p>
      )}
    </div>
  );
}

function Header({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
      <h2 className="truncate text-sm font-semibold text-gray-900">{name}</h2>
      <button
        onClick={onClose}
        aria-label={copy.close}
        className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        {copy.close}
      </button>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-600">{label}</dt>
      <dd className="font-medium text-gray-800">{children}</dd>
    </div>
  );
}
