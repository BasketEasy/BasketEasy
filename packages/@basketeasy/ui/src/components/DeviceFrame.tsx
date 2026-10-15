import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { IPhoneMockup } from 'react-device-mockup';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * A real product screenshot, framed as the device it was taken on: a phone
 * (a realistic iPhone from `react-device-mockup`, this file being its only
 * importer) or a desktop browser window (a bar with three dots and the page's
 * address; no maintained package draws one). Built for the landing page, where
 * the screenshots are the proof (`scripts/capture-landing-screenshots.mjs`
 * regenerates them from fixtures).
 *
 * It renders the image itself rather than taking children, so a call site
 * can't forget the intrinsic `width`/`height` (no layout shift) or the
 * loading strategy: `priority` is for the one above-the-fold frame, and
 * everything else loads lazily. Width stays caller-side (`w-60`, `w-full`):
 * sizing is composition; the frame's look is the variant.
 */
const frameVariants = cva('m-0', {
  variants: {
    variant: {
      // The mockup paints its bezel, island and buttons in `currentColor`, so
      // the colour stays a token here instead of a hex passed to the library.
      phone: 'flex justify-center text-charcoal drop-shadow-frame-phone',
      browser:
        'overflow-hidden rounded-lg border border-border-strong bg-surface shadow-frame-browser',
    },
  },
  defaultVariants: { variant: 'browser' },
});

/**
 * The mockup is sized by its screen width in px, not by CSS. Its bezel and
 * side buttons add about 7.2% to that (10px of bezel and 4px of buttons a side
 * at the 390px reference), so the screen is the measured box divided by this.
 */
const PHONE_OUTER_TO_SCREEN = 1.072;
/** Before the first measure (and in jsdom, which has no layout): `w-60`'s screen. */
const FALLBACK_SCREEN_WIDTH = 224;

export interface DeviceFrameProps extends VariantProps<typeof frameVariants> {
  src: string;
  /** What the screenshot shows, in French — it is the proof, not decoration. */
  alt: string;
  /** The image file's intrinsic size, so the frame reserves its space before it loads. */
  width: number;
  height: number;
  /** The address shown in the browser bar (`variant="browser"` only). */
  url?: string;
  /** Load eagerly at high priority: the hero's frame, never one below the fold. */
  priority?: boolean;
  className?: string;
}

export function DeviceFrame({
  variant,
  src,
  alt,
  width,
  height,
  url,
  priority = false,
  className,
}: DeviceFrameProps) {
  // React 18 only knows the lowercase attribute.
  const priorityProps = priority ? { fetchpriority: 'high' } : {};
  const imgProps: ImgHTMLAttributes<HTMLImageElement> = {
    src,
    alt,
    width,
    height,
    loading: priority ? 'eager' : 'lazy',
    decoding: 'async',
    ...priorityProps,
  };

  if (variant === 'phone') {
    return (
      <PhoneFrame className={cn(frameVariants({ variant }), className)}>
        <img {...imgProps} className="block h-full w-full bg-ground object-cover object-top" />
      </PhoneFrame>
    );
  }

  return (
    <figure className={cn(frameVariants({ variant }), className)}>
      <div
        aria-hidden="true"
        className="flex h-8 items-center gap-1.5 border-b border-border bg-surface-2 px-3"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        {url && (
          <span className="ml-3 truncate rounded bg-ground px-2.5 py-0.5 text-xs text-muted">
            {url}
          </span>
        )}
      </div>
      <img {...imgProps} className="block h-auto w-full bg-ground" />
    </figure>
  );
}

/** Fits the mockup to the width the caller gave the figure, and follows it on resize. */
function PhoneFrame({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [screenWidth, setScreenWidth] = useState(FALLBACK_SCREEN_WIDTH);

  // Layout effect: the first measure lands before paint, so the frame never
  // visibly jumps from the fallback size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setScreenWidth(Math.floor(el.clientWidth / PHONE_OUTER_TO_SCREEN));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <figure ref={ref} className={className}>
      <IPhoneMockup
        screenWidth={screenWidth}
        screenType="island"
        frameColor="currentColor"
        // The app never draws under the island or the home indicator: both
        // strips are real safe areas in the app's surface colour, and the
        // screenshot (captured at 390 x 751) fills only the space between.
        statusbarColor="var(--device-safe-area)"
      >
        {children}
      </IPhoneMockup>
    </figure>
  );
}
