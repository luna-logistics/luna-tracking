import { cn } from '@/lib/utils';

type Props = {
  /** Which side the wave faces. `top` = wave curves DOWNward (used at the
   *  bottom of a coloured band that precedes a lighter one). `bottom` = wave
   *  curves UPward (used at the top of a coloured band). */
  side?: 'top' | 'bottom';
  /** The fill colour of the wave itself — should match the ADJACENT band that
   *  the curve is "reaching into". Accepts any Tailwind text-* utility because
   *  the SVG's <path> reads `fill="currentColor"`. */
  color?: string;
  className?: string;
};

/**
 * Soft rounded wave divider — the visual language from Luna's brand flyer.
 * SVG-based (crisp on any width, no raster CLS), single <path>, decorative
 * only (aria-hidden). Adds a subtle "gliding" transition between coloured
 * bands rather than a hard edge.
 */
export function WaveDivider({ side = 'top', color = 'text-background', className }: Props) {
  const rotate = side === 'top' ? '' : 'rotate-180';
  return (
    <div className={cn('w-full leading-none', color, rotate, className)} aria-hidden="true">
      <svg
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        className="block h-12 w-full sm:h-16 md:h-20"
      >
        <path
          d="M0,64 C240,16 480,80 720,48 C960,16 1200,64 1440,32 L1440,80 L0,80 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
