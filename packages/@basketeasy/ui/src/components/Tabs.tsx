import {
  type ComponentPropsWithoutRef,
  type ElementRef,
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

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, forwardedRef) => {
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
          'inline-flex h-11 max-w-full snap-x snap-mandatory items-center overflow-x-auto scroll-px-6 rounded-md bg-border/40 p-1 [scrollbar-width:none] md:h-10 [&::-webkit-scrollbar]:hidden',
          className,
        )}
        {...props}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-1 left-1 w-6 bg-gradient-to-r from-border/60 to-transparent transition-opacity duration-150',
          canScrollLeft ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-1 right-1 w-6 bg-gradient-to-l from-border/60 to-transparent transition-opacity duration-150',
          canScrollRight ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
});
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, forwardedRef) => {
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
        'inline-flex min-h-9 snap-start items-center justify-center whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium text-charcoal transition-colors data-[state=active]:bg-surface data-[state=active]:text-orange-text data-[state=active]:shadow-sm md:py-1.5',
        focusRing,
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={className} {...props} />
));
TabsContent.displayName = 'TabsContent';
