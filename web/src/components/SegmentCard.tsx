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
      <section className="overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-cyan-300/30">
        <Header name={name} onClose={onClose} />
        <div className="space-y-1 px-4 py-4 text-sm text-neutral-400">
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
    <section className="overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-cyan-300/30">
      <Header name={name} onClose={onClose} />

      <div className="px-4 py-4">
        {/* Score — large display; the chip carries the band colour, the text stays white for contrast */}
        <div className="mb-4 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: bandColor, boxShadow: `0 0 12px ${bandColor}` }}
          />
          <span className="text-5xl font-semibold tracking-tight tabular-nums text-white">{score.toFixed(1)}</span>
          <span className="text-sm text-neutral-400">{copy.cardLabels.score}</span>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {copy.cardLabels.topReasons}
            </p>
            <ul className="space-y-1.5">
              {reasons.map(({ key, text }) => (
                <li key={key} className="text-sm leading-snug text-neutral-200">
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
            <dt className="text-neutral-400">{text.speedLimit}:</dt>
            <dd className="font-medium tabular-nums text-neutral-100">
              {p.maxspeed_kmh != null ? text.speedKmh(p.maxspeed_kmh) : text.speedUnknown}
            </dd>
          </div>
        </dl>
      )}
      {p.suggested_measure && (
        <p className="rounded-lg border-l-2 border-cyan-300 bg-cyan-300/10 px-3 py-2 text-sm text-neutral-100">
          <span className="font-semibold">{text.suggestedMeasure}:</span> {p.suggested_measure}
        </p>
      )}
    </div>
  );
}

function Header({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
      <h2 className="truncate text-base font-semibold text-white">{name}</h2>
      <button
        onClick={onClose}
        aria-label={copy.close}
        className="ml-2 flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-xs text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        {copy.close}
      </button>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="font-semibold tabular-nums text-white">{children}</dd>
    </div>
  );
}
