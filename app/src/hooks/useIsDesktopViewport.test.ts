import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIsDesktopViewport, DESKTOP_BREAKPOINT_PX } from './useIsDesktopViewport';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe('useIsDesktopViewport', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it('reads the viewport width at mount', () => {
    setViewportWidth(375);
    const { result } = renderHook(() => useIsDesktopViewport());
    expect(result.current).toBe(false);
  });

  it('treats exactly the breakpoint width as desktop', () => {
    setViewportWidth(DESKTOP_BREAKPOINT_PX);
    const { result } = renderHook(() => useIsDesktopViewport());
    expect(result.current).toBe(true);
  });

  it('reacts to a resize event after mount', () => {
    setViewportWidth(1024);
    const { result } = renderHook(() => useIsDesktopViewport());
    expect(result.current).toBe(true);

    act(() => {
      setViewportWidth(375);
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe(false);
  });
});
