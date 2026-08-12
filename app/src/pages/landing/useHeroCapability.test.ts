import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHeroCapability } from './useHeroCapability';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('useHeroCapability', () => {
  it('is static by default (jsdom has no matchMedia)', () => {
    const { result } = renderHook(() => useHeroCapability());
    expect(result.current).toBe('static');
  });

  it('is static when the viewport is narrow, even on a capable device', () => {
    stubMatchMedia(false);
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500);

    const { result } = renderHook(() => useHeroCapability());
    expect(result.current).toBe('static');
  });

  it('is full on a wide, high-concurrency device with no reduced-motion preference', () => {
    stubMatchMedia(false);
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);

    const { result } = renderHook(() => useHeroCapability());
    expect(result.current).toBe('full');
  });
});
