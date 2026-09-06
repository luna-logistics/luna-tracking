import { type ReactNode } from 'react';
import { useHeroBg } from '@/contexts/SiteContentContext';
import { cn } from '@/lib/utils';

type Props = {
  /** Image key (page-scoped, e.g. "home_hero"). Nothing renders when the
   *  admin hasn't uploaded an image yet — the caller's own background
   *  (gradient, solid) stays visible. */
  imageKey: string;
  /** Fallback background classes to keep painted when no image is set. */
  fallbackClassName?: string;
  /** Optional alt text for the (invisible-to-layout) crawler <img>. */
  imageAlt?: string;
  children: ReactNode;
  /** Overrides applied to the outer wrapper (positioning, min-height, ...). */
  className?: string;
};

/**
 * Wraps a hero band with an admin-controlled background photo.
 *
 * Renders the wrapper regardless (so the caller's spacing is stable), then
 * layers, from back to front:
 *   1. the fallback className (gradient / solid) — always painted so the
 *      band is never blank while the image loads.
 *   2. the background image, positioned by focal_x / focal_y + zoom.
 *   3. a dark-navy overlay whose opacity is the admin's `overlay` value.
 *   4. the caller's content (title, text, CTA).
 *
 * A crawler-friendly `<img loading="lazy" aria-hidden="true">` sits in the
 * DOM with `alt` so Google Images and screen readers can see the photo
 * even though the visual is applied via CSS background.
 */
export function HeroBackground({
  imageKey, fallbackClassName, imageAlt, children, className,
}: Props) {
  const bg = useHeroBg(imageKey);

  return (
    <div className={cn('relative isolate overflow-hidden', fallbackClassName, className)}>
      {bg?.url && (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-no-repeat bg-cover"
            style={{
              backgroundImage: `url(${bg.url})`,
              backgroundPosition: `${bg.focal_x}% ${bg.focal_y}%`,
              backgroundSize: `${bg.zoom}%`,
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-luna-navy-deep"
            style={{ opacity: (bg.overlay ?? 45) / 100 }}
          />
          {imageAlt && (
            <img
              src={bg.url}
              alt={imageAlt}
              loading="lazy"
              width={2400}
              height={1000}
              className="sr-only"
            />
          )}
        </>
      )}
      {children}
    </div>
  );
}
