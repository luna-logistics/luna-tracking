import { useEffect, useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ShoppingCart, Plus, Minus, X, CheckCircle2, ArrowRight, ArrowDown,
  HelpCircle, Package, MapPinned, ShieldCheck,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchActiveProducts, fetchProductCategories, productName, productSlug, categoryName, type Product, type ProductCategory } from '@/lib/products';
import { fetchDestinationCities, type DestinationCity } from '@/lib/cities';
import { createOrder, OrderRejectedError } from '@/lib/orders';
import { initiatePayment } from '@/lib/payment';
import { productUrl, urlFor } from '@/lib/url/routes';
import { useContent, useSiteImage } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { cn } from '@/lib/utils';

/**
 * Achat & Envoi (Shop & Ship) — "Achat Envoi Luna" redesign from Claude
 * Design (2026-09-14), rebuilt on the live stack. The visual shell is the
 * new navy design; ALL commerce logic is preserved: product fetch +
 * category filter, cart (add/qty/remove/total), the checkout flow
 * (recipient form → createOrder → initiatePayment) and the success state,
 * auth gating, product-detail links, i18n + admin `useContent`/`<Ed>`.
 */
export default function ShopAndShip() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const metaTitle       = useContent('shop-and-ship', 'meta_title',       t('shop.meta_title'));
  const metaDescription = useContent('shop-and-ship', 'meta_description', t('shop.meta_description'));
  const pageTitle       = useContent('shop-and-ship', 'page_title',       t('shop.page_title'));
  const pageIntro       = useContent('shop-and-ship', 'page_intro',       t('shop.page_intro'));
  const heroNote        = useContent('shop-and-ship', 'hero_note',        t('shop.hero_note'));
  const productsTitle   = useContent('shop-and-ship', 'products_title',   t('shop.products_title'));
  const productsSubtitle = useContent('shop-and-ship', 'products_subtitle', t('shop.products_subtitle'));
  const howTitle        = useContent('shop-and-ship', 'how_title',        t('shop.how_title'));
  const ogImage         = useSiteImage('shop_og', '') || undefined;
  const { user } = useAuth();
  const { lines, add, setQty, remove, clear, count } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [cities, setCities] = useState<DestinationCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [view, setView] = useState<'catalog' | 'checkout' | 'success'>('catalog');
  const [submitting, setSubmitting] = useState(false);
  const [afterSubmitMessage, setAfterSubmitMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchActiveProducts(), fetchProductCategories(), fetchDestinationCities()])
      .then(([p, c, ci]) => { setProducts(p); setCategories(c); setCities(ci); setLoading(false); });
  }, []);

  const categoryOf = (id: string) => categories.find((c) => c.id === id);
  const filtered = useMemo(
    () => filter === 'all' ? products : products.filter((p) => p.category_id === filter),
    [products, filter]
  );

  // Cart revalidation against the freshly-loaded active products: a line whose
  // product is no longer active/readable is "unavailable" (excluded from
  // checkout); a line whose live price differs is flagged and re-priced. The
  // stored snapshot (orders.items) is unchanged — we just checkout at the
  // current price and drop unavailable lines.
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const cartRows = useMemo(() => lines.map((l) => {
    const cur = productsById.get(l.product_id);
    const unavailable = !loading && !cur;
    const newPrice = cur ? cur.price : l.unit_price;
    return { l, cur, unavailable, priceChanged: !!cur && cur.price !== l.unit_price, oldPrice: l.unit_price, newPrice };
  }), [lines, productsById, loading]);
  const availableRows = cartRows.filter((r) => !r.unavailable);
  const revalidatedTotal = availableRows.reduce((s, r) => s + r.newPrice * r.l.quantity, 0);
  const priceChanges = cartRows.filter((r) => r.priceChanged && !r.unavailable);
  const hasUnavailable = cartRows.some((r) => r.unavailable);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const form = new FormData(e.currentTarget);
    if (availableRows.length === 0) { toast.error(t('shop.cart_all_unavailable')); return; }
    setSubmitting(true);
    try {
      // Checkout only available lines. Prices and the total are NOT sent: the
      // server rebuilds them from the catalogue (orders_reprice trigger).
      // (cart line's `slug` is the language-specific slug captured at add time)
      const items = availableRows.map((r) => ({ product_id: r.l.product_id, slug: r.l.slug, quantity: r.l.quantity }));
      const order = await createOrder({
        user_id: user.id,
        items,
        recipient_name: String(form.get('recipient_name') ?? ''),
        recipient_phone: String(form.get('recipient_phone') ?? ''),
        recipient_city_id: String(form.get('recipient_city_id') ?? '') || null,
        recipient_address: String(form.get('recipient_address') ?? ''),
        notes: String(form.get('notes') ?? '') || null,
      });
      // Order row confirmed — fire before the payment step (which may redirect away).
      trackEvent('courses_order_submitted', {
        item_count: items.reduce((n, i) => n + i.quantity, 0),
        line_count: items.length,
        value: Number(order.total),
        currency: 'EUR',
      });
      const pay = await initiatePayment(order, lang);
      if (pay.status === 'redirect') { window.location.href = pay.url; return; }
      setAfterSubmitMessage(pay.status === 'deferred' ? pay.message : (pay.message || t('common.error_generic')));
      clear();
      setView('success');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[shop] checkout failed', err);
      if (err instanceof OrderRejectedError && err.reason === 'product_unavailable') {
        // A product went inactive between page load and submit: reload the
        // catalogue so the cart flags it, and say why instead of a generic error.
        toast.error(t('shop.order_product_unavailable'));
        void fetchActiveProducts().then(setProducts);
      } else {
        toast.error(t('common.error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { key: '1', icon: ShoppingCart, title: useContent('shop-and-ship', 'step1_title', t('shop.step1_title')), body: useContent('shop-and-ship', 'step1_body', t('shop.step1_body')) },
    { key: '2', icon: Package,      title: useContent('shop-and-ship', 'step2_title', t('shop.step2_title')), body: useContent('shop-and-ship', 'step2_body', t('shop.step2_body')) },
    { key: '3', icon: MapPinned,    title: useContent('shop-and-ship', 'step3_title', t('shop.step3_title')), body: useContent('shop-and-ship', 'step3_body', t('shop.step3_body')) },
  ];

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} image={ogImage} />

      {/* ── Hero — navy over the delivery-team photo ── */}
      <section className="relative isolate bg-luna-ink">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-cover bg-no-repeat"
          style={{ backgroundImage: "url('/brand/achat-hero.jpg')", backgroundPosition: '72% 32%' }}
        />
        {/* Left-heavy gradient keeps the white copy readable over faces/light areas */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{ background: 'linear-gradient(97deg,rgba(10,22,80,.97) 0%,rgba(10,22,80,.95) 26%,rgba(10,22,80,.86) 44%,rgba(10,22,80,.6) 60%,rgba(10,22,80,.28) 78%,rgba(10,22,80,.12) 100%)' }}
        />
        <div className="relative mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(56px,7vw,96px)', paddingBottom: 'clamp(60px,7vw,100px)' }}>
          <div className="min-w-0" style={{ maxWidth: 'min(620px,62%)' }}>
            <p className="mb-[18px] text-[13px] font-semibold tracking-[0.2em] text-luna-aqua">
              {t('shop.hero_eyebrow').toUpperCase()}
            </p>
            <Ed page="shop-and-ship" field="page_title" as="h1" className="mb-5 block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-white">
              {pageTitle}
            </Ed>
            <Ed page="shop-and-ship" field="page_intro" as="div" multiline markdown className="mb-4 block text-[20px] font-normal leading-[1.55] text-[#DCE7F7]">
              {pageIntro}
            </Ed>
            <Ed page="shop-and-ship" field="hero_note" as="p" multiline className="mb-8 block text-[13px] leading-[1.75] text-[#B9C9E0]">
              {heroNote}
            </Ed>
            <div className="flex flex-wrap gap-3">
              <a href="#produits" className="inline-flex items-center gap-2.5 rounded-lg bg-luna-aqua px-[26px] py-[15px] text-[13px] font-semibold tracking-[.02em] text-luna-ink transition-colors hover:bg-luna-aqua2">
                {t('shop.hero_cta_products')} <ArrowDown className="h-[15px] w-[15px]" />
              </a>
              <a href="#etapes" className="inline-flex items-center gap-2.5 rounded-lg border border-white/50 px-6 py-[15px] text-[13px] font-semibold tracking-[.02em] text-white transition-colors hover:bg-white/10">
                <HelpCircle className="h-4 w-4" /> {t('shop.hero_cta_how')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Phone-only sticky cart bar: the cart column sits below the grid on
          small screens, so tapping "Ajouter" would otherwise look inert. */}
      {view === 'catalog' && count > 0 && (
        <div className="lg:hidden sticky top-16 z-30 border-b border-luna-hair bg-luna-ink">
          <div className="mx-auto flex max-w-[1220px] items-center gap-3 px-5 sm:px-8 py-2.5">
            <ShoppingCart className="h-5 w-5 shrink-0 text-luna-aqua" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm text-white">
              <span className="font-semibold">{t('shop.cart_bar_items', { count })}</span>
              <span className="text-[#B9C9E0]"> · {revalidatedTotal.toFixed(2)} €</span>
            </div>
            <button
              type="button"
              onClick={() => { setView('checkout'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="rounded-lg bg-luna-aqua px-4 py-2 text-[13px] font-semibold text-luna-ink hover:bg-luna-aqua2"
            >
              {t('shop.cart_bar_cta')}
            </button>
          </div>
        </div>
      )}

      <div className="bg-luna-mist">
        <section id="produits" className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(40px,5vw,64px)', paddingBottom: 'clamp(56px,7vw,88px)' }}>
          {view === 'catalog' && (
            <>
              {/* Header + category filter */}
              <div className="mb-[clamp(24px,3vw,36px)] flex flex-wrap items-end gap-5">
                <div className="min-w-0 flex-1 basis-[320px]">
                  <Ed page="shop-and-ship" field="products_title" as="h2" className="mb-2.5 block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink">
                    {productsTitle}
                  </Ed>
                  <Ed page="shop-and-ship" field="products_subtitle" as="p" className="block text-[20px] font-normal leading-[1.5] text-luna-muted-ink">
                    {productsSubtitle}
                  </Ed>
                </div>
                <div className="min-w-0 basis-[300px]">
                  <Label htmlFor="cat-filter" className="mb-2 block text-[11px] font-semibold tracking-[.14em] text-luna-muted-ink">
                    {t('shop.category_label').toUpperCase()}
                  </Label>
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger id="cat-filter" className="w-full border-[#C6D4E6] bg-white text-luna-royal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('shop.filter_all')}</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{categoryName(c, lang)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-[clamp(20px,2.5vw,32px)]">
                {/* Product grid */}
                <div className="min-w-0 flex-1 basis-[min(100%,560px)]">
                  {loading ? (
                    <div className="py-16 text-center text-luna-muted-ink">{t('common.loading')}</div>
                  ) : filtered.length === 0 ? (
                    <div className="rounded-xl border border-[#DCE5F0] bg-white p-10 text-center text-[13px] leading-relaxed text-luna-body">
                      {t('shop.products_empty')}
                    </div>
                  ) : (
                    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(212px,1fr))' }}>
                      {filtered.map((p) => (
                        <article key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-[#DCE5F0] bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-luna-aqua hover:shadow-[0_14px_30px_rgba(10,22,80,.13)]">
                          <Link to={productUrl(productSlug(p, lang), lang)} className="block">
                            {p.image_url ? (
                              <div className="aspect-[4/3] overflow-hidden border-b border-[#E6EDF7] bg-white">
                                <img src={p.image_url} alt={productName(p, lang)} width={600} height={450} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                              </div>
                            ) : (
                              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 border-b border-[#E6EDF7]" style={{ background: 'linear-gradient(160deg,#F7FAFE 0%,#EAF1FA 100%)' }}>
                                <span className="grid h-12 w-12 place-items-center rounded-full border border-[#D3E2F2] bg-white shadow-[0_2px_8px_rgba(10,22,80,.06)]">
                                  <ShoppingCart className="h-[22px] w-[22px] text-luna-sky" aria-hidden="true" />
                                </span>
                                <span className="text-[11px] font-medium tracking-[.04em] text-luna-body">{t('shop.photo_coming').toUpperCase()}</span>
                              </div>
                            )}
                          </Link>
                          <div className="flex flex-col gap-2.5 p-4">
                            <Link to={productUrl(productSlug(p, lang), lang)} className="line-clamp-2 text-[13px] font-semibold leading-[1.4] text-luna-royal hover:text-luna-ink">
                              {productName(p, lang)}
                            </Link>
                            <div className="h-px bg-[#EDF2F9]" />
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-[20px] font-semibold text-luna-ink">{p.price.toFixed(2)} €</span>
                              <span className="truncate text-[11px] font-medium text-luna-body">
                                {categoryName(categoryOf(p.category_id) ?? categories[0], lang)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                add({ product_id: p.id, slug: productSlug(p, lang), name: productName(p, lang), unit_price: p.price });
                                toast.success(t('shop.added_to_cart'));
                              }}
                              className="mt-0.5 flex items-center justify-center gap-2 rounded-lg border border-luna-royal bg-luna-royal px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-luna-azure"
                            >
                              <ShoppingCart className="h-4 w-4" /> {t('shop.add_to_cart')}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cart aside — navy card */}
                <aside
                  className="min-w-[min(100%,280px)] basis-[320px] overflow-hidden rounded-xl border border-luna-hair shadow-[0_10px_28px_rgba(10,22,80,.14)] lg:sticky lg:top-24"
                  style={{ background: 'linear-gradient(165deg,#0D2E6B 0%,#0A1650 100%)' }}
                >
                  <div className="flex items-center gap-3 border-b border-[#4A6FA0]/50 px-5 py-[18px]">
                    <span className="grid h-[38px] w-[38px] place-items-center rounded-full border border-luna-aqua/45 bg-luna-aqua/[.14]">
                      <ShoppingCart className="h-[19px] w-[19px] text-luna-aqua" />
                    </span>
                    <span className="text-[20px] font-semibold text-white">{t('shop.cart_title')}</span>
                    {count > 0 && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-luna-aqua px-2 py-0.5 text-xs font-bold text-luna-ink">{count}</span>
                    )}
                  </div>
                  <div className="p-5">
                    {lines.length === 0 ? (
                      <p className="mb-[18px] text-[13px] leading-[1.7] text-[#B9C9E0]">{t('shop.cart_empty_hint')}</p>
                    ) : (
                      <ul className="mb-4 divide-y divide-[#4A6FA0]/30">
                        {cartRows.map(({ l, unavailable, priceChanged, oldPrice, newPrice }) => (
                          <li key={l.product_id} className={cn('py-3 first:pt-0', unavailable && 'opacity-60')}>
                            <div className="line-clamp-2 text-[13px] font-medium text-white">{l.name}</div>
                            {unavailable && (
                              <div className="mt-1 inline-flex items-center rounded bg-red-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-red-300">
                                {t('shop.cart_unavailable')}
                              </div>
                            )}
                            {priceChanged && !unavailable && (
                              <div className="mt-1 text-[11px] text-luna-aqua">
                                {t('shop.cart_price_changed', { old: oldPrice.toFixed(2), new: newPrice.toFixed(2) })}
                              </div>
                            )}
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <div className="inline-flex items-center gap-1">
                                <button type="button" aria-label="-" disabled={unavailable} onClick={() => setQty(l.product_id, l.quantity - 1)}
                                  className="grid h-7 w-7 place-items-center rounded-md border border-[#4A6FA0]/60 text-[#E4EDF9] hover:bg-white/10 disabled:opacity-40">
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-8 text-center text-sm text-white">{l.quantity}</span>
                                <button type="button" aria-label="+" disabled={unavailable} onClick={() => setQty(l.product_id, l.quantity + 1)}
                                  className="grid h-7 w-7 place-items-center rounded-md border border-[#4A6FA0]/60 text-[#E4EDF9] hover:bg-white/10 disabled:opacity-40">
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <span className="text-[13px] font-semibold text-white">
                                {unavailable ? '—' : (newPrice * l.quantity).toFixed(2) + ' €'}
                              </span>
                              <button type="button" aria-label={t('shop.cart_remove')} onClick={() => remove(l.product_id)}
                                className="text-[#8FA3BF] hover:text-red-400">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {(hasUnavailable || priceChanges.length > 0) && (
                      <div className="mb-4 rounded-lg border border-luna-aqua/40 bg-luna-aqua/[.08] px-3 py-2 text-[11px] leading-[1.6] text-[#DCE7F7]">
                        {hasUnavailable && <div>{t('shop.cart_unavailable_note')}</div>}
                        {priceChanges.length > 0 && <div>{t('shop.cart_price_changed_note')}</div>}
                      </div>
                    )}

                    <div className="flex flex-col gap-2.5 rounded-lg border border-[#4A6FA0]/45 bg-white/[.05] px-4 py-3.5">
                      <div className="flex items-baseline justify-between gap-3 text-[13px] text-[#B9C9E0]">
                        <span>{t('shop.cart_subtotal')}</span>
                        <span className="font-semibold text-white">{revalidatedTotal.toFixed(2)} €</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-[13px] text-[#B9C9E0]">
                        <span>{t('shop.cart_shipping')}</span>
                        <span className="font-medium text-[#E4EDF9]">{t('shop.cart_shipping_tbd')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={availableRows.length === 0}
                      onClick={() => setView('checkout')}
                      className="mt-[18px] flex w-full items-center justify-center gap-2.5 rounded-lg bg-luna-aqua px-[18px] py-3.5 text-[13px] font-semibold text-luna-ink transition-colors hover:bg-luna-aqua2 disabled:cursor-not-allowed disabled:border disabled:border-[#4A6FA0]/60 disabled:bg-white/[.04] disabled:text-[#8FA3BF]"
                    >
                      {t('shop.cart_checkout')} <ArrowRight className="h-[15px] w-[15px]" />
                    </button>
                    <p className="mt-4 flex items-start gap-2.5 text-[11px] leading-[1.6] text-[#8FA3BF]">
                      <ShieldCheck className="mt-px h-[15px] w-[15px] shrink-0 text-luna-sky" aria-hidden="true" />
                      {t('shop.cart_reassurance')}
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}

          {view === 'checkout' && (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              <div className="rounded-xl border border-[#DCE5F0] bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-luna-ink">{t('shop.checkout_title')}</h2>
                <p className="mt-2 text-sm text-luna-body">{t('shop.checkout_intro')}</p>

                {(hasUnavailable || priceChanges.length > 0) && (
                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                    {hasUnavailable && <div>{t('shop.cart_unavailable_note')}</div>}
                    {priceChanges.length > 0 && <div>{t('shop.cart_price_changed_note')}</div>}
                  </div>
                )}

                {!user ? (
                  <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm text-amber-900">{t('shop.checkout_signin_required')}</p>
                    <Button asChild variant="navy" className="mt-3">
                      <Link to={urlFor('login', lang)}>{t('shop.checkout_signin_cta')}</Link>
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="mt-6 grid gap-5">
                    <h3 className="text-lg font-semibold text-luna-ink">{t('shop.checkout_recipient_title')}</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="recipient_name">{t('shop.checkout_recipient_name')}</Label>
                        <Input id="recipient_name" name="recipient_name" required className="mt-1.5" />
                      </div>
                      <div>
                        <Label htmlFor="recipient_phone">{t('shop.checkout_recipient_phone')}</Label>
                        <Input id="recipient_phone" name="recipient_phone" type="tel" required className="mt-1.5" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="recipient_city_id">{t('shop.checkout_recipient_city')}</Label>
                      <Select name="recipient_city_id" required>
                        <SelectTrigger id="recipient_city_id" className="mt-1.5">
                          <SelectValue placeholder={t('shop.checkout_recipient_city_placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {cities.map((c) => (
                            <SelectItem key={c.id} value={c.id} disabled={c.status !== 'active'}>
                              {c.name}
                              {c.status !== 'active' && (
                                <span className="ml-2 text-xs text-slate-500">— {t('shop.checkout_recipient_city_coming_soon')}</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="recipient_address">{t('shop.checkout_recipient_address')}</Label>
                      <Textarea id="recipient_address" name="recipient_address" required rows={3} className="mt-1.5" />
                    </div>
                    <div>
                      <Label htmlFor="notes">{t('shop.checkout_notes')}</Label>
                      <Textarea id="notes" name="notes" rows={2} className="mt-1.5" />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" variant="navy" size="lg" disabled={submitting}>
                        {submitting ? t('shop.checkout_submitting') : t('shop.checkout_submit')}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setView('catalog')}>
                        ← {t('shop.detail_back_to_catalog')}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {view === 'success' && (
            <div className="mx-auto max-w-3xl rounded-xl border-2 border-luna-aqua bg-white p-8 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-10 w-10 text-luna-sky" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-semibold text-luna-ink">{t('shop.checkout_success_title')}</h2>
              <p className="mt-2 text-sm text-luna-body">{t('shop.checkout_success_body')}</p>
              {afterSubmitMessage && (
                <p className="mt-3 inline-block rounded-md border border-luna-aqua/30 bg-luna-aqua/10 px-4 py-2 text-sm text-luna-ink">
                  {afterSubmitMessage}
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button variant="navy" onClick={() => setView('catalog')}>← {t('shop.detail_back_to_catalog')}</Button>
                <Button asChild variant="outline">
                  <Link to={urlFor('accountOrders', lang)}>{t('account.sidebar_orders')}</Link>
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* ── Comment ça marche ── */}
        {view === 'catalog' && (
          <Block name="shop-how-it-works">
            <section id="etapes" className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingBottom: 'clamp(64px,8vw,104px)' }}>
              <div className="mb-[clamp(44px,6vw,72px)] h-px" style={{ background: 'linear-gradient(90deg,rgba(10,22,80,0) 0%,#D3DEEC 12%,#D3DEEC 88%,rgba(10,22,80,0) 100%)' }} />
              <Ed page="shop-and-ship" field="how_title" as="h2" className="mb-[clamp(32px,4vw,52px)] block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink">
                {howTitle}
              </Ed>
              <div className="grid gap-[clamp(24px,3vw,48px)] sm:grid-cols-2 nav:grid-cols-3">
                {steps.map((s, i) => (
                  <div key={s.key} className={`min-w-0 border-t-2 pt-6 ${i === 0 ? 'border-luna-aqua' : 'border-[#C6D4E6]'}`}>
                    <div className="mb-4 flex items-center gap-3">
                      <span className="text-[13px] font-semibold tracking-[.06em] text-luna-sky">0{s.key}</span>
                      <s.icon className="h-[22px] w-[22px] text-luna-royal" aria-hidden="true" />
                    </div>
                    <Ed page="shop-and-ship" field={`step${s.key}_title`} as="h3" className="mb-2.5 block text-[20px] font-semibold leading-[1.3] text-luna-ink">
                      {s.title}
                    </Ed>
                    <Ed page="shop-and-ship" field={`step${s.key}_body`} as="p" multiline className="block text-[13px] leading-[1.7] text-luna-body">
                      {s.body}
                    </Ed>
                  </div>
                ))}
              </div>
            </section>
          </Block>
        )}
      </div>
    </>
  );
}
