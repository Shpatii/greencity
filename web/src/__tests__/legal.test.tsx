import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Imprint from '@/app/imprint/page';
import Privacy from '@/app/privacy/page';
import { operator } from '@/content/legal';

describe('legal pages', () => {
  it('imprint lists the data sources and marks missing operator details', () => {
    render(<Imprint />);
    expect(screen.getByRole('heading', { level: 1, name: 'Imprint' })).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap contributors, Open Database License/)).toBeInTheDocument();
    if (!operator.name) {
      expect(screen.getAllByText(/to be completed by the operator/).length).toBeGreaterThan(0);
    }
  });

  it('privacy states that nothing is tracked or loaded from third parties', () => {
    render(<Privacy />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/sets no cookies/)).toBeInTheDocument();
    expect(screen.getByText(/loads nothing from third parties/)).toBeInTheDocument();
  });
});
