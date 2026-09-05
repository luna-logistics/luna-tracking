import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, Plus, Minus, X, CheckCircle2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchActiveProducts, fetchProductCategories, productName, categoryName, type Product, type ProductCategory } from '@/lib/products';
import { fetchDestinationCities, type DestinationCity } from '@/lib/cities';
import { createOrder, type OrderItem } from '@/lib/orders';
import { initiatePayment } from '@/lib/payment';
import { productUrl, urlFor } from '@/lib/url/routes';

export default function ShopAndShip() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { user } = useAuth();
  const { lines, add, setQty, remove, clear, total, count } = useCart();
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

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const items: OrderItem[] = lines.map((l) => ({
        product_id: l.product_id, slug: l.slug, name: l.name, quantity: l.quantity, unit_price: l.unit_price,
      }));
      const order = await createOrder({
        user_id: user.id,
        items,
        total,
        recipient_name: String(form.get('recipient_name') ?? ''),
        recipient_phone: String(form.get('recipient_phone') ?? ''),
        recipient_city_id: String(form.get('recipient_city_id') ?? '') || null,
        recipient_address: String(form.get('recipient_address') ?? ''),
        notes: String(form.get('notes') ?? '') || null,
      });
      const pay = await initiatePayment(order, lang);
      if (pay.status === 'redirect') { window.location.href = pay.url; return; }
      setAfterSubmitMessage(pay.status === 'deferred' ? pay.message : (pay.message || t('common.error_generic')));
      clear();
      setView('success');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[shop] checkout failed', err);
      toast.error(t('common.error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEO title={t('shop.meta_title')} description={t('shop.meta_description')} />

      <section className="bg-luna-gradient text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-bold">{t('shop.page_title')}</h1>
          <p className="mt-3 text-white/90 max-w-2xl">{t('shop.page_intro')}</p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Catalog / checkout main column */}
          <div>
            {view === 'catalog' && (
              <>
                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <Label htmlFor="cat-filter" className="text-luna-navy">
                    {t('shop.filter_all')}
                  </Label>
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger id="cat-filter" className="w-56">
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

                {loading ? (
                  <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((p) => (
                      <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col">
                        <Link to={productUrl(p.slug, lang)} className="block">
                          <div className="aspect-square rounded-xl bg-luna-navy/5 grid place-items-center text-luna-navy/40">
                            {/* Placeholder icon in lieu of image_url per spec */}
                            <ShoppingCart className="h-10 w-10" aria-hidden="true" />
                          </div>
                          <h3 className="mt-3 font-semibold text-luna-navy line-clamp-2">{productName(p, lang)}</h3>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {categoryName(categoryOf(p.category_id) ?? categories[0], lang)}
                          </div>
                        </Link>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-lg font-bold text-luna-navy">{p.price.toFixed(2)} €</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="navy"
                            onClick={() => {
                              add({ product_id: p.id, slug: p.slug, name: productName(p, lang), unit_price: p.price });
                              toast.success(t('shop.added_to_cart'));
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t('shop.add_to_cart')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === 'checkout' && (
              <div className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-luna-navy">{t('shop.checkout_title')}</h2>
                <p className="mt-2 text-sm text-slate-600">{t('shop.checkout_intro')}</p>

                {!user ? (
                  <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm text-amber-900">{t('shop.checkout_signin_required')}</p>
                    <Button asChild variant="navy" className="mt-3">
                      <Link to={urlFor('login', lang)}>{t('shop.checkout_signin_cta')}</Link>
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="mt-6 grid gap-5">
                    <h3 className="text-lg font-semibold text-luna-navy">{t('shop.checkout_recipient_title')}</h3>
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
            )}

            {view === 'success' && (
              <div className="rounded-2xl border-2 border-luna-cyan bg-white p-8 shadow-sm text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-luna-blue" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-semibold text-luna-navy">{t('shop.checkout_success_title')}</h2>
                <p className="mt-2 text-sm text-slate-600">{t('shop.checkout_success_body')}</p>
                {afterSubmitMessage && (
                  <p className="mt-3 text-sm text-luna-navy bg-luna-cyan/10 border border-luna-cyan/30 rounded-md px-4 py-2 inline-block">
                    {afterSubmitMessage}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-3 justify-center">
                  <Button variant="navy" onClick={() => setView('catalog')}>
                    ← {t('shop.detail_back_to_catalog')}
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={urlFor('accountOrders', lang)}>{t('account.sidebar_orders')}</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Cart sidebar */}
          <aside className="lg:sticky lg:top-20 h-fit rounded-2xl border-2 border-luna-blue/30 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-luna-navy">
              <ShoppingCart className="h-5 w-5" />
              <h2 className="font-semibold">{t('shop.cart_title')}</h2>
              {count > 0 && (
                <span className="ml-auto inline-flex items-center rounded-full bg-luna-cyan text-luna-navy text-xs font-bold px-2 py-0.5">
                  {count}
                </span>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t('shop.cart_empty')}</p>
            ) : (
              <>
                <ul className="mt-4 space-y-3 divide-y divide-slate-100">
                  {lines.map((l) => (
                    <li key={l.product_id} className="pt-3 first:pt-0">
                      <div className="text-sm font-medium text-luna-navy line-clamp-2">{l.name}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="-"
                            className="h-7 w-7 rounded-md border border-slate-200 grid place-items-center hover:bg-slate-50"
                            onClick={() => setQty(l.product_id, l.quantity - 1)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-8 text-center text-sm">{l.quantity}</span>
                          <button
                            type="button"
                            aria-label="+"
                            className="h-7 w-7 rounded-md border border-slate-200 grid place-items-center hover:bg-slate-50"
                            onClick={() => setQty(l.product_id, l.quantity + 1)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="text-sm font-semibold text-luna-navy">
                          {(l.unit_price * l.quantity).toFixed(2)} €
                        </div>
                        <button
                          type="button"
                          aria-label={t('shop.cart_remove')}
                          onClick={() => remove(l.product_id)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-luna-navy">{t('shop.cart_total')}</span>
                  <span className="text-lg font-bold text-luna-navy">{total.toFixed(2)} €</span>
                </div>
                {view === 'catalog' && (
                  <Button variant="navy" className="mt-4 w-full" onClick={() => setView('checkout')}>
                    {t('shop.cart_checkout')}
                  </Button>
                )}
              </>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
