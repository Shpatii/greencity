import type { ReactNode } from 'react';
import type { SegmentFeature } from '@/lib/loadData';
import type { Meta, FactorKey, SegmentProps } from '@/lib/types';
import { copy } from '@/content/copy';
import { scoreToColor } from '@/content/theme';

interface Props {
  segment: SegmentFeature;
  meta: Meta;
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

export default function SegmentCard({ segment, meta, onClose }: Props) {
  const p = segment.properties;
  const name = p.name ?? copy.unnamed;

  if (!p.eligible) {
    return (
      <div className="overflow-hidden rounded-xl bg-white/90 shadow-lg backdrop-blur-sm">
        <Header name={name} onClose={onClose} />
        <div className="space-y-1 px-4 py-4 text-sm text-gray-500">
          <p>{copy.emptyStates.noRank}</p>
          <p>{copy.emptyStates.notEnoughMeasurements}</p>
        </div>
      </div>
    );
  }

  const w = meta.default_weights;
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
  const dotColor = scoreToColor(score);

  return (
    <div className="overflow-hidden rounded-xl bg-white/90 shadow-lg backdrop-blur-sm">
      <Header name={name} onClose={onClose} />

      <div className="px-4 py-4">
        {/* Score — large display */}
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums" style={{ color: dotColor }}>
            {score.toFixed(1)}
          </span>
          <span className="text-sm text-gray-400">{copy.segmentCard.scoreLabel}</span>
        </div>

        {/* Stats grid */}
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Stat label={copy.segmentCard.confidenceLabel}>
            {(p.confidence * 100).toFixed(0)}%
          </Stat>
          <Stat label={copy.segmentCard.nPointsLabel}>{p.n_points}</Stat>
          <Stat label={copy.segmentCard.nOvertakesLabel}>{p.n_overtakes}</Stat>
        </dl>

        {/* Reason texts */}
        {topReasons.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {copy.segmentCard.reasonsTitle}
            </p>
            <ul className="space-y-1.5">
              {topReasons.map(({ key, text }) => (
                <li key={key} className="text-xs leading-snug text-gray-600">
                  {text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
      <h2 className="max-w-[200px] truncate text-sm font-semibold text-gray-800">{name}</h2>
      <button
        onClick={onClose}
        aria-label={copy.close}
        className="ml-2 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        {copy.close}
      </button>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800">{children}</dd>
    </div>
  );
}
