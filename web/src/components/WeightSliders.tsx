import { copy } from '@/content/copy';
import { FACTORS } from '@/lib/score';
import type { Weights } from '@/lib/types';
import { PRESETS, rebalance, sameWeights, type PresetKey } from '@/lib/weights';

interface Props {
  weights: Weights;
  defaults: Weights;
  onChange: (weights: Weights) => void;
}

// One slider per factor; moving one rescales the others so the total stays 100%.
export default function WeightSliders({ weights, defaults, onChange }: Props) {
  const text = copy.weightSliders;
  const isDefault = sameWeights(weights, defaults);

  return (
    <section className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/[0.08]">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{text.title}</h2>
        <button
          type="button"
          onClick={() => onChange(defaults)}
          disabled={isDefault}
          className="rounded px-2 py-1 text-xs font-medium text-amber-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-default disabled:text-neutral-600 disabled:hover:bg-transparent"
        >
          {text.reset}
        </button>
      </div>
      <p className="mb-3 text-xs text-neutral-400">{text.hint}</p>
      <div role="group" aria-label={text.presetsLabel} className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
          const active = sameWeights(weights, PRESETS[key]);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(PRESETS[key])}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                active ? 'bg-white text-black ring-white' : 'text-neutral-200 ring-white/15 hover:bg-white/10'
              }`}
            >
              {text.presets[key]}
            </button>
          );
        })}
      </div>
      <ul className="space-y-2">
        {FACTORS.map((key) => {
          const label = copy.factorLabels[key];
          const pct = Math.round(weights[key] * 100);
          return (
            <li key={key} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="text-neutral-200" title={copy.factorTooltips[key]}>{label}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={pct}
                aria-label={text.sliderLabel(label)}
                aria-valuetext={`${pct}%`}
                onChange={(e) => onChange(rebalance(weights, key, Number(e.target.value) / 100))}
                className="w-full accent-amber-400"
              />
              <span className="text-right tabular-nums text-white">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
