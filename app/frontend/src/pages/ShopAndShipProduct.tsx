import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, ArrowLeft, Plus } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useCart } from '@/contexts/CartContext';
import { fetchProductBySlug, fetchProductCategories, productName, productDescription, productMetaTitle, productMetaDescription, productSlug, categoryName, type Product, type ProductCategory } from '@/lib/products';
import { urlFor } from '@/lib/url/routes';
import { useLangUrls } from '@/contexts/LangUrlContext';

const SITE_URL = 'https://lunatrackinglogistics.com';

export default function ShopAndShipProduct() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { slug } = useParams<{ slug: string }>();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const { setLangUrls } = useLangUrls();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([fetchProductBySlug(lang, slug), fetchProductCategories()])
      .then(([p, cats]) => { setProduct(p); setCategories(cats); setLoading(false); });
  }, [slug, lang]);

  useEffect(() => {
    if (!product) { setLangUrls(null); return; }
    setLangUrls({
      fr: `/achat-envoi/${product.slug_fr}`,
      en: `/en/shop-and-ship/${product.slug_en}`,
    });
    return () => setLangUrls(null);
  }, [product, setLangUrls]);

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500">{t('common.loading')}</div>
    );
  }

  if (!product) {
    return (
      <>
        <SEO title={t('shop.detail_not_found_title')} noindex />
        <section className="py-16">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <h1 className="text-2xl font-bold text-luna-navy">{t('shop.detail_not_found_title')}</h1>
            <p className="mt-3 text-slate-600">{t('shop.detail_not_found_body')}</p>
            <Button asChild variant="navy" className="mt-6">
              <Link to={urlFor('shopAndShip', lang)}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t('shop.detail_back_to_catalog')}
              </Link>
            </Button>
          </div>
        </section>
      </>
    );
  }

  const cat = categories.find((c) => c.id === product.category_id);
  const displayName = productName(product, lang);
  const displayDescription = productDescription(product, lang);
  const displayCategory = cat ? categoryName(cat, lang) : '';

  // Product JSON-LD (schema.org). Uses the ACTUAL page language, so a crawler
  // seeing the /en/ variant reads the English name/description. offers.price
  // is the same across locales — one price in €.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: displayName,
    description: displayDescription ?? undefined,
    sku: productSlug(product, lang),
    gtin13: product.barcode ?? undefined,
    category: displayCategory,
    weight: product.weight_kg ? { '@type': 'QuantitativeValue', value: product.weight_kg, unitCode: 'KGM' } : undefined,
    offers: {
      '@type': 'Offer',
      price: product.price.toFixed(2),
      priceCurrency: 'EUR',
      availability: product.is_active ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}${lang === 'en' ? `/en/shop-and-ship/${product.slug_en}` : `/achat-envoi/${product.slug_fr}`}`,
    },
  };

  return (
    <>
      <SEO
        title={`${productMetaTitle(product, lang)} — ${t('brand.name')}`}
        description={productMetaDescription(product, lang) ?? undefined}
        type="article"
        image={product.image_url ?? undefined}
        imageAlt={productName(product, lang)}
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <section className="py-10 sm:py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Link to={urlFor('shopAndShip', lang)} className="inline-flex items-center gap-1 text-sm text-luna-blue hover:underline">
            <ArrowLeft className="h-4 w-4" /> {t('shop.detail_back_to_catalog')}
          </Link>

          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <div className="aspect-square rounded-2xl bg-luna-navy/5 grid place-items-center text-luna-navy/40">
              <ShoppingCart className="h-20 w-20" aria-hidden="true" />
            </div>
            <div>
              {displayCategory && (
                <div className="text-xs uppercase tracking-wide text-luna-blue font-semibold">{displayCategory}</div>
              )}
              <h1 className="mt-1 text-3xl font-bold text-luna-navy">{displayName}</h1>
              <div className="mt-4 text-3xl font-bold text-luna-navy">{product.price.toFixed(2)} €</div>
              {displayDescription && <p className="mt-5 text-slate-700 leading-relaxed">{displayDescription}</p>}

              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {product.weight_kg && (
                  <>
                    <dt className="text-slate-500">{t('shop.detail_weight')}</dt>
                    <dd className="text-luna-navy font-medium">{product.weight_kg} kg</dd>
                  </>
                )}
                {product.barcode && (
                  <>
                    <dt className="text-slate-500">{t('shop.detail_barcode')}</dt>
                    <dd className="text-luna-navy font-mono text-xs">{product.barcode}</dd>
                  </>
                )}
              </dl>

              {product.is_active ? (
                <Button
                  variant="navy"
                  size="lg"
                  className="mt-6"
                  onClick={() => {
                    add({ product_id: product.id, slug: productSlug(product, lang), name: displayName, unit_price: product.price });
                    toast.success(t('shop.added_to_cart'));
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {t('shop.add_to_cart')}
                </Button>
              ) : (
                <div className="mt-6 rounded-md bg-slate-100 text-slate-600 px-4 py-2 inline-block text-sm">
                  {t('shop.detail_out_of_stock')}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
