import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Small "?" / info affordance that reveals a one- or two-sentence plain-
 * French explanation on hover or keyboard focus. Self-contained (ships
 * its own TooltipProvider) so any screen can drop `<InfoHint text="…" />`
 * next to a label without wiring a provider at the app root.
 *
 * Keep the text short and jargon-free — this is for entrepreneurs, not
 * developers.
 */
export function InfoHint({
  text, className, label = "Plus d'informations",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex items-center justify-center text-slate-400 hover:text-luna-navy transition-colors align-middle',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-navy/30 rounded-full',
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
