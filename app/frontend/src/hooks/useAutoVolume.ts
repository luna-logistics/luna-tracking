import { useState } from 'react';
import { formatM3, parseDecimal, volumeFieldValue } from '@/lib/pricing/volume';

/**
 * Volume field that pre-fills live from the dimensions but stays editable
 * (/calculateur, /tarifs). `typed` is null while the field follows the
 * dimensions; typing makes it an override, clearing it hands it back to the
 * dimensions, and `reset()` does that from a "use the calculated volume" link.
 */
export function useAutoVolume(derived: number | null, initial?: string | null) {
  const [typed, setTyped] = useState<string | null>(initial ? initial : null);
  const overridden = typed != null;
  return {
    /** Shown in the input. */
    value: volumeFieldValue(typed, derived),
    /** The override only ('' while auto) — what the pricing builders receive. */
    typed: typed ?? '',
    /** Following the dimensions, which currently give a volume. */
    auto: !overridden && derived != null,
    /** Typed volume that disagrees with complete dimensions → offer the reset. */
    differsFromDims: overridden && derived != null && parseDecimal(typed) !== Number(formatM3(derived)),
    derivedLabel: derived == null ? '' : formatM3(derived),
    onChange: (v: string) => setTyped(v.trim() === '' ? null : v),
    reset: () => setTyped(null),
  };
}
