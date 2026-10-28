import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RankList from '@/components/RankList';
import type { SegmentFeature } from '@/lib/loadData';
import type { SegmentProps } from '@/lib/types';

function makeSegment(overrides: Partial<SegmentProps>): SegmentFeature {
  const base: SegmentProps = {
    id: 'seg_test',
    osm_id: null,
    name: 'Test Street',
    length_m: 100,
    n_points: 30,
    n_overtakes: 10,
    share_below_150: 0.5,
    avg_overtake_cm: 140,
    danger_per_100m: 3,
    mean_danger_risk: 0.5,
    mean_pm_risk: 0.4,
    roughness_norm: 0.3,
    traffic_flow: 0.7,
    avg_speed_kmh: 18,
    f_safety: 0.5,
    f_danger: 0.4,
    f_surface: 0.3,
    f_air: 0.4,
    f_flow: 0.3,
    missing: [],
    confidence: 1.0,
    eligible: true,
    score: 40,
    rank: 1,
    reason_texts: { safety: 'Some safety text' },
  };
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[9.2, 49.1], [9.21, 49.11]] },
    properties: { ...base, ...overrides },
  };
}

describe('RankList', () => {
  it('renders heading and column labels', () => {
    render(<RankList segments={[]} selectedId={null} setSelectedId={jest.fn()} />);
    expect(screen.getByText('Top 10 priority streets')).toBeInTheDocument();
    expect(screen.getByText('Street')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
  });

  it('shows a custom empty text', () => {
    render(<RankList segments={[]} selectedId={null} setSelectedId={jest.fn()} emptyText="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('shows the ranking-changed hint only when asked', () => {
    const { rerender } = render(<RankList segments={[]} selectedId={null} setSelectedId={jest.fn()} />);
    expect(screen.queryByText('Ranking changed')).not.toBeInTheDocument();
    rerender(<RankList segments={[]} selectedId={null} setSelectedId={jest.fn()} changed />);
    expect(screen.getByText('Ranking changed')).toBeInTheDocument();
  });

  it('renders top-10 eligible segments sorted by rank', () => {
    const segments = Array.from({ length: 15 }, (_, i) =>
      makeSegment({ id: `seg_${i}`, name: `Street ${i + 1}`, rank: i + 1, score: 80 - i }),
    );
    render(<RankList segments={segments} selectedId={null} setSelectedId={jest.fn()} />);
    // Only 10 rows
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(11); // 10 data rows + 1 header
    expect(screen.getByText('Street 1')).toBeInTheDocument();
    expect(screen.queryByText('Street 11')).not.toBeInTheDocument();
  });

  it('excludes non-eligible segments', () => {
    const eligible = makeSegment({ id: 'e1', name: 'Eligible', eligible: true, rank: 1 });
    const notEligible = makeSegment({
      id: 'e2',
      name: 'Not Eligible',
      eligible: false,
      rank: null,
      score: null,
    });
    render(
      <RankList
        segments={[eligible, notEligible]}
        selectedId={null}
        setSelectedId={jest.fn()}
      />,
    );
    expect(screen.getByText('Eligible')).toBeInTheDocument();
    expect(screen.queryByText('Not Eligible')).not.toBeInTheDocument();
  });

  it('falls back to "Unnamed street" when name is null', () => {
    const seg = makeSegment({ name: null });
    render(<RankList segments={[seg]} selectedId={null} setSelectedId={jest.fn()} />);
    expect(screen.getByText('Unnamed street')).toBeInTheDocument();
  });

  it('highlights the selected row', () => {
    const seg = makeSegment({ id: 'seg_sel', name: 'My Street' });
    const { container } = render(
      <RankList segments={[seg]} selectedId="seg_sel" setSelectedId={jest.fn()} />,
    );
    const row = container.querySelector('tr.bg-white\\/10');
    expect(row).not.toBeNull();
  });

  it('calls setSelectedId with the segment id on click', async () => {
    const seg = makeSegment({ id: 'seg_click' });
    const setSelectedId = jest.fn();
    render(<RankList segments={[seg]} selectedId={null} setSelectedId={setSelectedId} />);
    await userEvent.click(screen.getByText('Test Street'));
    expect(setSelectedId).toHaveBeenCalledWith('seg_click');
  });
});
