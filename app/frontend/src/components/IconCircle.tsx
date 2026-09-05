import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Outlined icon inside a soft circle — the service-pillar language from the
 * brand flyer. `variant="onLight"` for cards on the off-white ground,
 * `variant="onDark"` for the navy hero.
 */
export function IconCircle({
  icon: Icon,
  variant = 'onLight',
  className,
  label,
}: {
  icon: LucideIcon;
  variant?: 'onLight' | 'onDark';
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex h-14 w-14 items-center justify-center rounded-full ring-1',
        variant === 'onLight'
          ? 'bg-luna-navy/5 ring-luna-navy/20 text-luna-navy'
          : 'bg-white/10 ring-luna-cyan/60 text-luna-cyan',
        className
      )}
      role="img"
      aria-label={label}
    >
      <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden={label ? undefined : true} />
    </div>
  );
}
