import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';
import { Badge } from './Badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './Dialog';
import { List, ListItem } from './List';

export const Tabs = TabsPrimitive.Root;

// One recipe for a tab and for « Plus »: the active mark is a 2px orange rule
// under the label (a border, so nothing shifts), the label turns bold orange.
const TAB_LOOK =
  'inline-flex min-h-12 snap-start items-center justify-center whitespace-nowrap border-b-2 border-transparent px-2 text-sm font-medium text-charcoal transition-colors md:px-3 data-[state=active]:border-orange data-[state=active]:font-bold data-[state=active]:text-orange-text';

export interface TabsMore {
  /** The sections moved out of the bar on a phone (their triggers carry `secondary`). */
  items: Array<{ value: string; label: string; badge?: ReactNode }>;
  /** The tab currently shown, to light « Plus » up when it is one of `items`. */
  activeValue: string;
  onSelect: (value: string) => void;
}

export interface TabsListProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /**
   * Below `md` only the first triggers stay in the bar and a « Plus » button
   * opens a sheet with the `secondary` ones; from `md` up every trigger shows
   * and « Plus » is gone. Leave it out for a bar that always fits (≤ 4 tabs).
   */
  more?: TabsMore;
}

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, more, children, ...props }, forwardedRef) => {
    const [moreOpen, setMoreOpen] = useState(false);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollState = useCallback(() => {
      const el = listRef.current;
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }, []);

    // Runs after every render (e.g. a badge's digit count changing a trigger's
    // width) and on container resize (e.g. rotating the phone) — either can
    // flip whether the list actually overflows, which the edge fades below
    // must track to stay honest about which direction still has hidden tabs.
    useLayoutEffect(() => {
      updateScrollState();
    });

    useEffect(() => {
      const el = listRef.current;
      if (!el) return;
      const observer = new ResizeObserver(updateScrollState);
      observer.observe(el);
      return () => observer.disconnect();
    }, [updateScrollState]);

    return (
      <div className="relative max-w-full">
        <TabsPrimitive.List
          ref={(node) => {
            listRef.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
          }}
          onScroll={updateScrollState}
          data-more={more ? '' : undefined}
          className={cn(
            // max-w-full + overflow-x-auto: a tab list wider than its container
            // (four tabs at 320px measured 633px into 288px) scrolls instead of
            // pushing the page sideways. Wrapping is not an option here — the
            // fixed h-11/md:h-10 track would clip a second row. snap-x settles
            // a swipe on a tab boundary instead of stopping mid-label; the
            // native scrollbar is hidden in favor of the edge fades below,
            // which are the actual scroll affordance.
            // scroll-px-6 matches the w-6 fade overlays below, so a snapped or
            // scrollIntoView-ed trigger never ends up partially hidden under
            // its own fade.
            // min-h rather than h: a trigger carrying a Badge (e.g. the count
            // badges on TeamDetailPage's tabs) is taller than the old fixed
            // h-11/h-10 track, which silently overflowed and — since only
            // overflow-x was set — made the browser treat overflow-y as auto
            // too, producing an unwanted vertical scrollbar. Sizing to content
            // means there's nothing to overflow.
            // The bar sits on white (`surface`), never on the cream ground:
            // charcoal labels and the orange active mark keep their contrast
            // there. w-full + flex-1 triggers below md, so a bar of up to four
            // reads as equal halves; md:inline-flex hugs the content again.
            'group/tabs flex min-h-12 w-full max-w-full snap-x snap-mandatory items-stretch overflow-x-auto overflow-y-hidden scroll-px-6 rounded-lg border border-border bg-surface px-1 [scrollbar-width:none] md:inline-flex md:w-auto [&::-webkit-scrollbar]:hidden',
            className,
          )}
          {...props}
        >
          {children}
          {more && (
            <button
              type="button"
              aria-haspopup="dialog"
              data-state={
                more.items.some((item) => item.value === more.activeValue) ? 'active' : 'inactive'
              }
              onClick={() => setMoreOpen(true)}
              className={cn(TAB_LOOK, 'flex-1 md:hidden', focusRing)}
            >
              Plus
              <span aria-hidden="true" className="ml-1">
                ⋯
              </span>
            </button>
          )}
        </TabsPrimitive.List>
        {more && (
          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <DialogContent variant="sheet" className="md:hidden">
              <DialogHeader>
                <DialogTitle>Plus de sections</DialogTitle>
                <DialogDescription>Les autres sections de cette page.</DialogDescription>
              </DialogHeader>
              <List className="mt-4" variant="panel">
                {more.items.map((item) => (
                  <ListItem key={item.value} asChild chevron trailing={item.badge}>
                    <button
                      type="button"
                      onClick={() => {
                        more.onSelect(item.value);
                        setMoreOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  </ListItem>
                ))}
              </List>
            </DialogContent>
          </Dialog>
        )}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-px left-px w-6 bg-gradient-to-r from-surface to-transparent transition-opacity duration-150',
            canScrollLeft ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-px right-px w-6 bg-gradient-to-l from-surface to-transparent transition-opacity duration-150',
            canScrollRight ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>
    );
  },
);
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /**
   * A trailing count badge (e.g. a roster/list size next to the tab label),
   * styled and gapped consistently across every tab bar in the app —
   * TeamDetailPage's four count-badged tabs used to hand-roll this
   * (className="gap-2" + an outline/neutral/aria-hidden Badge) at every call
   * site.
   */
  badge?: ReactNode;
  /** Below `md` this tab moves into the « Plus » sheet of its `TabsList` (see `TabsList`'s `more`). */
  secondary?: boolean;
}

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  ({ className, badge, secondary, children, ...props }, forwardedRef) => {
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    // Radix doesn't scroll a newly-active trigger into view on its own —
    // without this, tapping a tab that was clipped at the scrollable edge
    // (see TabsList above) leaves it half-visible after selection instead of
    // settling fully into frame.
    useEffect(() => {
      const el = triggerRef.current;
      if (!el) return;
      const scrollIntoViewIfActive = () => {
        if (el.getAttribute('data-state') === 'active') {
          el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        }
      };
      scrollIntoViewIfActive();
      const observer = new MutationObserver(scrollIntoViewIfActive);
      observer.observe(el, { attributes: true, attributeFilter: ['data-state'] });
      return () => observer.disconnect();
    }, []);

    return (
      <TabsPrimitive.Trigger
        ref={(node) => {
          triggerRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        className={cn(
          TAB_LOOK,
          'flex-1 md:flex-none',
          secondary && 'hidden md:inline-flex',
          badge != null && 'gap-2',
          focusRing,
          className,
        )}
        {...props}
      >
        {children}
        {badge != null && (
          <Badge
            variant="outline"
            tone="neutral"
            aria-hidden="true"
            className="group-data-[more]/tabs:max-md:hidden"
          >
            {badge}
          </Badge>
        )}
      </TabsPrimitive.Trigger>
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={className} {...props} />
));
TabsContent.displayName = 'TabsContent';
