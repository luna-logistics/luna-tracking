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

/** Google Maps search for a postal address (works on desktop + mobile apps). */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Belgique`)}`;
}
