import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResponseMeter } from './ResponseMeter';

describe('ResponseMeter', () => {
  it('says the counts, so the bar is never a colour-only signal', () => {
    render(<ResponseMeter going={9} maybe={2} notGoing={1} pending={2} />);

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Présences : 9 oui, 2 peut-être, 1 non, 2 sans réponse',
    );
  });

  it('omits a bucket nobody is in rather than naming a zero', () => {
    render(<ResponseMeter going={8} maybe={0} notGoing={0} pending={4} />);

    expect(screen.getByRole('img')).toHaveAccessibleName('Présences : 8 oui, 4 sans réponse');
  });

  it('renders an empty track, and no division by zero, for an empty roster', () => {
    const { container } = render(<ResponseMeter going={0} maybe={0} notGoing={0} pending={0} />);

    expect(screen.getByRole('img')).toHaveAccessibleName('Présences : aucun participant');
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });

  it('sizes each segment by its share of the roster', () => {
    const { container } = render(<ResponseMeter going={5} maybe={2} notGoing={2} pending={1} />);

    const widths = [...container.querySelectorAll('span')].map(
      (s) => (s as HTMLElement).style.width,
    );
    expect(widths).toEqual(['50%', '20%', '20%', '10%']);
  });

  it('draws the segments in answer order: oui, peut-être, non, sans réponse', () => {
    const { container } = render(<ResponseMeter going={1} maybe={1} notGoing={1} pending={1} />);

    const classes = [...container.querySelectorAll('span')].map((s) => s.className);
    expect(classes).toEqual(['bg-success', 'bg-blue-green-2', 'bg-error', 'bg-sunk']);
  });
});
