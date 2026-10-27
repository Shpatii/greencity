import type { ReactNode } from 'react';
import type { SegmentFeature } from '@/lib/loadData';
import type { Meta, FactorKey, SegmentProps, Weights } from '@/lib/types';
import { copy } from '@/content/copy';
import { colorForScore } from '@/content/theme';

interface Props {
  segment: SegmentFeature;
  meta: Meta;
  /** Current slider weights; defaults to meta.default_weights. */
  weights?: Weights;
  onClose: () => void;
}

function factorValues(p: SegmentProps): Record<FactorKey, number> {
  return {
    safety: p.f_safety,
    danger: p.f_danger,
    surface: p.f_surface,
    air: p.f_air,
    flow: p.f_flow,
  };
}

export default function SegmentCard({ segment, meta, weights, onClose }: Props) {
  const p = segment.properties;
  const name = p.name ?? copy.unnamed;

  if (!p.eligible) {
    return (
      <section className="overflow-hidden rounded border border-gray-200 bg-white">
        <Header name={name} onClose={onClose} />
        <div className="space-y-1 px-4 py-4 text-sm text-gray-600">
          <p>{copy.emptyStates.noRank}</p>
          <p>{copy.emptyStates.notEnoughMeasurements}</p>
        </div>
      </section>
    );
  }

  const w = weights ?? meta.default_weights;
  const fv = factorValues(p);

  // Top-3 reason texts sorted by contribution (weight × factor value), descending
  const topReasons = (Object.keys(p.reason_texts) as FactorKey[])
    .map((k) => ({
      key: k,
      text: p.reason_texts[k]!,
      contribution: w[k] * fv[k],
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const score = p.score ?? 0;
  const bandColor = colorForScore(score);

  return (
    <section className="overflow-hidden rounded border border-gray-200 bg-white">
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

        {/* Stats grid */}
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Stat label={copy.cardLabels.confidence}>
            {(p.confidence * 100).toFixed(0)}%
          </Stat>
          <Stat label={copy.cardLabels.measurements}>{p.n_points}</Stat>
          <Stat label={copy.cardLabels.overtakes}>{p.n_overtakes}</Stat>
        </dl>

        {/* Reason texts */}
        {topReasons.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              {copy.cardLabels.topReasons}
            </p>
            <ul className="space-y-1.5">
              {topReasons.map(({ key, text }) => (
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
