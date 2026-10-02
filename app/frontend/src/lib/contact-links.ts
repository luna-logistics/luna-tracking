/**
 * Contact link helpers shared by the Contact page, the footer and the
 * legal pages — one place to build tel:, WhatsApp and Maps URLs from
 * the human-readable values the admin types.
 */

/** "+32 470 12 34 56" → "tel:+32470123456" */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** WhatsApp click-to-chat wants the number without "+" or spaces. */
export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

/**
 * Google Maps search for a postal address (works on desktop + mobile apps).
 * `country` is appended to disambiguate the query; it defaults to Belgium, so a
 * non-Belgian office (e.g. the Kinshasa branch) MUST pass its own country —
 * otherwise the pin lands in the wrong country.
 */
export function mapsUrl(address: string, country = 'Belgique'): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${country}`)}`;
}
