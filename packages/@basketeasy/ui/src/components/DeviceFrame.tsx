import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * A real product screenshot, framed as the device it was taken on: a phone
 * (charcoal bezel, rounded screen) or a desktop browser window (a bar with
 * three dots and the page's address). Built for the landing page, where the
 * screenshots are the proof (`scripts/capture-landing-screenshots.mjs`
 * regenerates them from fixtures).
 *
 * It renders the image itself rather than taking children, so a call site
 * can't forget the intrinsic `width`/`height` (no layout shift) or the
 * loading strategy: `priority` is for the one above-the-fold frame, and
 * everything else loads lazily. Width stays caller-side (`w-60`, `w-full`):
 * sizing is composition; the frame's look is the variant.
 */
const frameVariants = cva('overflow-hidden', {
  variants: {
    variant: {
      phone: 'rounded-device bg-charcoal p-2.5 shadow-frame-phone',
      browser: 'rounded-lg border border-border-strong bg-surface shadow-frame-browser',
    },
  },
  defaultVariants: { variant: 'browser' },
});

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
  const isPhone = variant === 'phone';
  // React 18 only knows the lowercase attribute.
  const priorityProps = priority ? { fetchpriority: 'high' } : {};
  return (
    <figure className={cn(frameVariants({ variant }), 'm-0', className)}>
      {!isPhone && (
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
      )}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...priorityProps}
        className={cn('block h-auto w-full bg-ground', isPhone && 'rounded-device-screen')}
      />
    </figure>
  );
}
