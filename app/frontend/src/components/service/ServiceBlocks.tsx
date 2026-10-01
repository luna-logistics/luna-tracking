import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WaveDivider } from '@/components/WaveDivider';

/**
 * Building blocks shared by the four service pages (air freight, sea freight,
 * home delivery, parcel pickup). Same visual language as /a-propos: navy
 * gradient hero with a wave, white cards with a blue outline, navy CTA band.
 */

export function ServiceHero({ title, intro, image, imageAlt }: {
  title: string; intro: string; image: string; imageAlt: string;
}) {
  return (
    <section className="bg-luna-gradient text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/90">{intro}</p>
        </div>
        <img
          src={image}
          alt={imageAlt}
          width={800}
          height={500}
          decoding="async"
          className="aspect-[16/10] w-full rounded-2xl object-cover shadow-lg"
        />
      </div>
      <WaveDivider side="top" color="text-background" />
    </section>
  );
}

/** Column that holds the page's sections. */
export function ServiceBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl space-y-12 px-4 pb-14 pt-6 sm:px-6">{children}</div>;
}

export function ServiceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-bold text-luna-navy">{title}</h2>
      <div className="mt-4 space-y-3 text-[17px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

/** Numbered procedure: one action per step. */
export function ServiceSteps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-4">
      {items.map((it, i) => (
        <li key={i} className="flex gap-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-luna-blue text-sm font-semibold text-white" aria-hidden="true">{i + 1}</span>
          <p className="pt-0.5">{it}</p>
        </li>
      ))}
    </ol>
  );
}

/** Outlined card, for a formula, a price list or a worked example. */
export function ServiceCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">{children}</div>
  );
}

export function ServiceLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="font-medium text-luna-blue underline-offset-2 hover:underline">{children}</Link>;
}

/** Native <details> accordion: answers stay in the DOM for crawlers and work without JS state. */
export function ServiceFaq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="space-y-3">
      {items.map((f, i) => (
        <details key={i} className="group rounded-xl border border-slate-200 bg-white px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-luna-navy [&::-webkit-details-marker]:hidden">
            <span>{f.q}</span>
            <ChevronDown className="h-5 w-5 shrink-0 text-luna-blue transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-3 text-[16px] leading-relaxed text-slate-700">{f.a}</div>
        </details>
      ))}
    </div>
  );
}

/** One call to action at the foot of the page. */
export function ServiceCta({ to, label }: { to: string; label: string }) {
  return (
    <section className="relative bg-luna-gradient-soft text-white">
      <WaveDivider side="bottom" color="text-background" />
      <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6">
        <Button asChild variant="brand" size="lg">
          <Link to={to}>
            {label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
