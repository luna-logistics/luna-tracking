import { CONTACT_EMAILS } from '@/lib/contact-emails';

/** One mailto link per customer-contact address, stacked on separate lines. */
export function ContactEmails({ className }: { className?: string }) {
  return (
    <>
      {CONTACT_EMAILS.map((e) => (
        <span key={e} className="block">
          <a href={`mailto:${e}`} className={className}>{e}</a>
        </span>
      ))}
    </>
  );
}
