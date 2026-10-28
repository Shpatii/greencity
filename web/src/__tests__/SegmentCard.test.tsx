import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SegmentCard from '@/components/SegmentCard';
import type { SegmentFeature } from '@/lib/loadData';
import type { Meta, SegmentProps } from '@/lib/types';

const meta: Meta = {
  version: '1.1',
  source: 'atrai',
  generated_at: '2026-10-27T12:00:00+01:00',
  city: 'heilbronn',
  n_segments: 10,
  n_eligible: 8,
  min_points: 5,
  confidence_n: 30,
  danger_p95: 6.89,
  city_share_below_150: 0.41,
  safety_prior_k: 10,
  danger_min_length_m: 50,
  default_weights: { safety: 0.35, danger: 0.25, surface: 0.15, air: 0.15, flow: 0.1 },
  bbox: [9.17, 49.11, 9.25, 49.17],
};

function makeFeature(overrides: Partial<SegmentProps>): SegmentFeature {
  const base: SegmentProps = {
    id: 'seg_001',
    osm_id: null,
    name: 'Test Street',
    length_m: 100,
    n_points: 30,
    n_overtakes: 12,
    share_below_150: 0.6,
    avg_overtake_cm: 120,
    danger_per_100m: 3,
    mean_danger_risk: 0.5,
    mean_pm_risk: 0.4,
    roughness_norm: 0.3,
    traffic_flow: 0.7,
    avg_speed_kmh: 18,
    f_safety: 0.6,
    f_danger: 0.4,
    f_surface: 0.3,
    f_air: 0.4,
    f_flow: 0.3,
    missing: [],
    confidence: 0.8,
    eligible: true,
    score: 49.9,
    rank: 17,
    reason_texts: {
      safety: 'Safety text here',
      danger: 'Danger text here',
      surface: 'Surface text here',
    },
  };
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[9.2, 49.1], [9.21, 49.11]] },
    properties: { ...base, ...overrides },
  };
}

describe('SegmentCard', () => {
  it('shows name, score, confidence, n_points, n_overtakes for eligible segment', () => {
    render(<SegmentCard segment={makeFeature({})} meta={meta} onClose={jest.fn()} />);
    expect(screen.getByText('Test Street')).toBeInTheDocument();
    expect(screen.getByText('49.9')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument(); // confidence 0.8 → 80%
    expect(screen.getByText('30')).toBeInTheDocument();  // n_points
    expect(screen.getByText('12')).toBeInTheDocument();  // n_overtakes
  });

  it('shows up to 3 reason texts', () => {
    render(<SegmentCard segment={makeFeature({})} meta={meta} onClose={jest.fn()} />);
    expect(screen.getByText('Safety text here')).toBeInTheDocument();
    expect(screen.getByText('Danger text here')).toBeInTheDocument();
    expect(screen.getByText('Surface text here')).toBeInTheDocument();
  });

  it('orders reason texts by weight × factor contribution', () => {
    // safety: w=0.35 × f=0.9 = 0.315 → highest
    // danger: w=0.25 × f=0.5 = 0.125
    // surface: w=0.15 × f=0.1 = 0.015 → should be excluded (only top 3 out of 3 anyway)
    const feature = makeFeature({
      f_safety: 0.9,
      f_danger: 0.5,
      f_surface: 0.1,
      reason_texts: {
        safety: 'SAFETY',
        danger: 'DANGER',
        surface: 'SURFACE',
      },
    });
    const { container } = render(<SegmentCard segment={feature} meta={meta} onClose={jest.fn()} />);
    const items = container.querySelectorAll('li');
    expect(items[0]).toHaveTextContent('SAFETY');
    expect(items[1]).toHaveTextContent('DANGER');
    expect(items[2]).toHaveTextContent('SURFACE');
  });

  it('shows at most 3 reason texts even when 5 are present', () => {
    const feature = makeFeature({
      reason_texts: {
        safety: 'S', danger: 'D', surface: 'Su', air: 'A', flow: 'F',
      },
    });
    const { container } = render(<SegmentCard segment={feature} meta={meta} onClose={jest.fn()} />);
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('shows "Unnamed street" when name is null', () => {
    render(<SegmentCard segment={makeFeature({ name: null })} meta={meta} onClose={jest.fn()} />);
    expect(screen.getAllByText('Unnamed street').length).toBeGreaterThan(0);
  });

  it('shows ineligible state with copy text when not eligible', () => {
    const feature = makeFeature({ eligible: false, score: null, rank: null });
    render(<SegmentCard segment={feature} meta={meta} onClose={jest.fn()} />);
    expect(screen.getByText('This segment has not been ranked.')).toBeInTheDocument();
    expect(screen.getByText('Not enough measurements to calculate a score.')).toBeInTheDocument();
    expect(screen.queryByText('Priority score')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = jest.fn();
    render(<SegmentCard segment={makeFeature({})} meta={meta} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: '×' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows infrastructure, speed limit and suggested measure (contract 3.2b)', () => {
    const segment = makeFeature({
      infra_class: 'painted_lane',
      maxspeed_kmh: 50,
      infra_gap: true,
      suggested_measure: 'Upgrade painted lane to a physically protected lane',
    });
    render(<SegmentCard segment={segment} meta={meta} onClose={jest.fn()} />);
    expect(screen.getByText('Painted lane')).toBeInTheDocument();
    expect(screen.getByText('50 km/h')).toBeInTheDocument();
    expect(screen.getByText(/Upgrade painted lane/)).toBeInTheDocument();
  });

  it('says "unknown" without a speed limit', () => {
    render(<SegmentCard segment={makeFeature({ infra_class: 'none', maxspeed_kmh: null })} meta={meta} onClose={jest.fn()} />);
    expect(screen.getByText('No bike infrastructure')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('hides the infrastructure row for v1.0 data without the fields', () => {
    render(<SegmentCard segment={makeFeature({})} meta={meta} onClose={jest.fn()} />);
    expect(screen.queryByText('Speed limit:')).not.toBeInTheDocument();
    expect(screen.queryByText(/Suggested measure/)).not.toBeInTheDocument();
  });
});
