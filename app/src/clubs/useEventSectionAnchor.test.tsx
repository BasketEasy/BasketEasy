import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EVENT_SECTION_IDS, useEventOpenSections } from './useEventSectionAnchor';

type Props = { eventId: string; isDesktop: boolean; openSection: string | null; extra?: string[] };
const render = (initialProps: Props) =>
  renderHook((props: Props) => useEventOpenSections(props)[0], { initialProps });

describe('useEventOpenSections', () => {
  it('seeds Présences on a phone, the extras and the anchored item', () => {
    const { result } = render({
      eventId: 'e1',
      isDesktop: false,
      openSection: EVENT_SECTION_IDS.notes,
      extra: [EVENT_SECTION_IDS.vote],
    });
    expect(result.current).toEqual(['presences', 'vote', 'notes']);
  });

  it('does not seed Présences on desktop', () => {
    const { result } = render({ eventId: 'e1', isDesktop: true, openSection: null });
    expect(result.current).toEqual([]);
  });

  it('adds a later anchor without closing what is open, once', () => {
    const { result, rerender } = render({ eventId: 'e1', isDesktop: false, openSection: null });
    rerender({ eventId: 'e1', isDesktop: false, openSection: 'vote' });
    rerender({ eventId: 'e1', isDesktop: false, openSection: 'vote' });
    expect(result.current).toEqual(['presences', 'vote']);
  });

  it('resets to the new event’s defaults when eventId changes', () => {
    const { result, rerender } = render({
      eventId: 'e1',
      isDesktop: false,
      openSection: 'vote',
    });
    act(() => rerender({ eventId: 'e2', isDesktop: false, openSection: null }));
    expect(result.current).toEqual(['presences']);
  });
});
