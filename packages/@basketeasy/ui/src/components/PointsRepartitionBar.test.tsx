import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PointsRepartitionBar } from './PointsRepartitionBar';

describe('PointsRepartitionBar', () => {
  it('renders an empty track and says so when nothing was scored', () => {
    render(
      <PointsRepartitionBar
        label="Répartition des points de Camille Roy"
        threePointPoints={0}
        twoPointPoints={0}
        freeThrowPoints={0}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Répartition des points de Camille Roy : aucun point' }),
    ).toBeInTheDocument();
  });

  it('names each bucket in points, never as a percentage', () => {
    render(
      <PointsRepartitionBar
        label="Répartition des points de Camille Roy"
        threePointPoints={27}
        twoPointPoints={72}
        freeThrowPoints={18}
      />,
    );

    const bar = screen.getByRole('img');
    // The sheet records no attempts, so there is no accuracy to state — the
    // accessible name must never grow a "%".
    expect(bar).toHaveAccessibleName(
      'Répartition des points de Camille Roy : 27 points sur 3 points, 72 points sur 2 points, 18 points sur lancers francs',
    );
  });

  it('omits a bucket that scored nothing rather than drawing a zero-width segment', () => {
    const { container } = render(
      <PointsRepartitionBar
        label="Répartition"
        threePointPoints={0}
        twoPointPoints={14}
        freeThrowPoints={5}
      />,
    );

    expect(container.querySelectorAll('span')).toHaveLength(2);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Répartition : 14 points sur 2 points, 5 points sur lancers francs',
    );
  });

  it('prints a count inside a wide segment and leaves a narrow one to the legend', () => {
    render(
      <PointsRepartitionBar
        label="Répartition"
        threePointPoints={3}
        twoPointPoints={96}
        freeThrowPoints={1}
      />,
    );

    // 96 of 100 is wide enough to hold its number; 3 and 1 are not, and a
    // clipped digit is worse than none — the legend carries them.
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('sizes each segment by its share of the total', () => {
    const { container } = render(
      <PointsRepartitionBar
        label="Répartition"
        threePointPoints={25}
        twoPointPoints={50}
        freeThrowPoints={25}
      />,
    );

    const widths = [...container.querySelectorAll('span')].map(
      (segment) => (segment as HTMLElement).style.width,
    );
    expect(widths).toEqual(['25%', '50%', '25%']);
  });
});
