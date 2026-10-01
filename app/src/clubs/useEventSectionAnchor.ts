import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * The event page's block ids. Three of them are the destination of an old
 * `?tab=` deep link (see `EVENT_TAB_ANCHORS`); `decision` and `logistique`
 * are anchors in their own right, so a future notification can link straight
 * to the answer or to the address.
 */
export const EVENT_SECTION_IDS = {
  decision: 'decision',
  presences: 'presences',
  logistique: 'logistique',
  notes: 'notes',
  vote: 'vote',
  partage: 'partage',
  apresLaRencontre: 'apres-la-rencontre',
} as const;

/**
 * Scroll margin of every anchored block. On a phone the sticky `MobileTopBar`
 * (56px) and `PageBar` (48px) cover 104px, more than `scroll-mt-20`.
 * Held here so the blocks can't drift.
 */
export const EVENT_SECTION_SCROLL_MARGIN = 'scroll-mt-28 md:scroll-mt-20';

/**
 * Where an incoming `?tab=` lands now that the event page is a single scroll
 * for both roles.
 *
 * The four tab values were the page's URL contract — a convocation e-mail, a
 * bookmark or a link pasted in a club's group chat still carries one — so
 * they keep working: instead of selecting a tab they scroll to the block that
 * absorbed it. `apercu` is deliberately absent: it was the default tab, its
 * content is now the top of the page, and the page already opens there.
 *
 * `effectif` maps to « Qui vient ? » rather than to a squad list, which is
 * the rename the audit asked for (§3.8): "effectif" names the team, and the
 * question the tab actually answered was who is coming tonight.
 */
export const EVENT_TAB_ANCHORS: Record<string, string> = {
  // Not an old tab: the home's « Changer » on a travel choice lands here.
  decision: EVENT_SECTION_IDS.decision,
  effectif: EVENT_SECTION_IDS.presences,
  vote: EVENT_SECTION_IDS.vote,
  partage: EVENT_SECTION_IDS.partage,
  scoresheet: EVENT_SECTION_IDS.apresLaRencontre,
};

/**
 * Scrolls to the block an incoming `?tab=` names, once it exists.
 *
 * The blocks it targets are query consumers that mount in a loading state, so
 * this retries on a short interval instead of firing once: on the first paint
 * the vote block is a skeleton and the scoresheet block is not in the DOM at
 * all. It gives up after a second — a `?tab=vote` on a match whose vote is
 * not open has no destination, and the correct outcome there is simply to
 * stay at the top of the page rather than to jump somewhere arbitrary.
 */
export function useEventSectionAnchor(tab: string | null): void {
  useEffect(() => {
    const targetId = tab ? EVENT_TAB_ANCHORS[tab] : undefined;
    if (!targetId) {
      return;
    }
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const element = document.getElementById(targetId);
      // jsdom has no layout, so scrollIntoView is undefined there.
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (element || attempts >= 10) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [tab]);
}

/**
 * The open items of an event page's `SectionAccordion`, shared by the manager
 * and player views.
 *
 * Seeded with « Présences » on a phone (on desktop it is a plain section, not
 * an item), the item an incoming deep link names, and whatever `extra` the
 * view owes the reader. Re-seeded when `eventId` changes (a new event in the
 * same mounted page starts from its own defaults), and a later `openSection`
 * is added, never closed again. Never written back to the URL.
 */
export function useEventOpenSections({
  eventId,
  isDesktop,
  openSection,
  extra = [],
}: {
  eventId: string;
  isDesktop: boolean;
  openSection: string | null;
  extra?: string[];
}): [string[], Dispatch<SetStateAction<string[]>>] {
  const initialOpen = () => [
    ...(isDesktop ? [] : [EVENT_SECTION_IDS.presences]),
    ...extra,
    ...(openSection ? [openSection] : []),
  ];
  const [open, setOpen] = useState<string[]>(initialOpen);
  useEffect(() => {
    setOpen(initialOpen());
    // Only a new event re-seeds; the other inputs are folded in below or by the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  useEffect(() => {
    if (openSection)
      setOpen((current) => (current.includes(openSection) ? current : [...current, openSection]));
  }, [openSection]);
  return [open, setOpen];
}
