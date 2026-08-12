import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Hero } from './Hero';

vi.mock('./HeroCanvas', () => ({
  HeroCanvas: () => <div data-testid="hero-canvas-stub" />,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Hero', () => {
  it('renders the brand headline and subhead', () => {
    render(<Hero />);
    expect(
      screen.getByRole('heading', { name: 'Moins de tableurs, plus de terrain.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/BasketEasy centralise calendriers/)).toBeInTheDocument();
  });

  it('does not mount the WebGL canvas by default (jsdom has no matchMedia)', () => {
    render(<Hero />);
    expect(screen.queryByTestId('hero-canvas-stub')).not.toBeInTheDocument();
  });

  it('mounts the WebGL canvas when the device is reported as capable', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);

    render(<Hero />);
    expect(screen.getByTestId('hero-canvas-stub')).toBeInTheDocument();
  });

  it('scrolls to #demo when "Tester la démo live" is clicked', async () => {
    const user = userEvent.setup();
    document.body.innerHTML += '<div id="demo"></div>';
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(<Hero />);
    await user.click(screen.getByRole('button', { name: 'Tester la démo live' }));

    expect(scrollIntoView).toHaveBeenCalled();
  });
});
