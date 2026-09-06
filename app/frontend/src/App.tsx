import { Toaster } from '@/components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { SiteContentProvider } from '@/contexts/SiteContentContext';
import { EditModeProvider } from '@/contexts/EditModeContext';
import { LangUrlProvider } from '@/contexts/LangUrlContext';
import { HreflangTags } from '@/components/HreflangTags';
import { PublicLayout } from '@/components/PublicLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminGate } from '@/components/AdminGate';
import { setVisitLanguage } from '@/i18n';

// Eager: homepage + login (critical paths).
import Index from '@/pages/Index';
import Login from '@/pages/Login';

// Lazy: everything else.
const Tracking = lazy(() => import('@/pages/Tracking'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const Contact = lazy(() => import('@/pages/Contact'));
const ShopAndShip = lazy(() => import('@/pages/ShopAndShip'));
const ShopAndShipProduct = lazy(() => import('@/pages/ShopAndShipProduct'));
const Forwarding = lazy(() => import('@/pages/Forwarding'));
const Signup = lazy(() => import('@/pages/Signup'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));
const Account = lazy(() => import('@/pages/Account'));
const AccountOrders = lazy(() => import('@/pages/AccountOrders'));
const AccountInvoices = lazy(() => import('@/pages/AccountInvoices'));
const AccountShell = lazy(() => import('@/components/AccountShell').then((m) => ({ default: m.AccountShell })));
const AdminShell = lazy(() => import('@/components/AdminShell').then((m) => ({ default: m.AdminShell })));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const AdminCities = lazy(() => import('@/pages/AdminCities'));
const AdminProducts = lazy(() => import('@/pages/AdminProducts'));
const AdminOrders = lazy(() => import('@/pages/AdminOrders'));
const AdminForwardingRequests = lazy(() => import('@/pages/AdminForwardingRequests'));
const AdminAuthProviders = lazy(() => import('@/pages/AdminAuthProviders'));
const AdminContent = lazy(() => import('@/pages/AdminContent'));
const BlogIndex = lazy(() => import('@/pages/BlogIndex'));
const BlogPost = lazy(() => import('@/pages/BlogPost'));
const AdminBlog = lazy(() => import('@/pages/AdminBlog'));
const AdminBlogForm = lazy(() => import('@/pages/AdminBlogForm'));
const AdminCollaborators = lazy(() => import('@/pages/AdminCollaborators'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient();

/** Loading state for lazy chunks — always painted on the site's ground so it
 *  never looks like the page died. */
function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-luna-navy" aria-label="Loading" />
    </div>
  );
}

/**
 * Syncs the active i18n language with the URL. A URL that starts with /en
 * adopts English for THIS visit (session), never persists. No prefix →
 * whatever the two-value model resolves to (visit → explicit preference → FR).
 *
 * Deliberately NO auto-redirect for non-FR effective language — a fresh visit
 * to / falls back to FR (Luna's primary market: Belgium). The explicit
 * switcher stays the only way to lock EN.
 */
function LanguageSync() {
  const { i18n } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    const isEn = /^\/en(\/|$)/.test(location.pathname);
    if (isEn) {
      setVisitLanguage('en');
      if (i18n.language !== 'en') i18n.changeLanguage('en');
    } else if (i18n.language !== 'fr') {
      // Only align back to FR when the URL is FR — respect an explicit EN
      // preference in localStorage on paths that happen to be language-neutral.
      i18n.changeLanguage('fr');
    }
  }, [location.pathname, i18n]);

  return null;
}

/**
 * Every routed page. Rendered TWICE from the top-level router: once for the FR
 * paths (root) and once for the EN paths (under /en). Kept as a single tree so
 * a bilingual route pair is authored ONCE per key, using the URL registry.
 */
function PageRoutes({ lang }: { lang: 'fr' | 'en' }) {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* Public — inside PublicLayout (Navbar + Footer) */}
          <Route path="/" element={<PublicLayout><Index /></PublicLayout>} />
          <Route path={t('/suivi', '/tracking')} element={<PublicLayout><Tracking /></PublicLayout>} />
          <Route path={t('/tarifs', '/pricing')} element={<PublicLayout><Pricing /></PublicLayout>} />
          <Route path={t('/contact', '/contact')} element={<PublicLayout><Contact /></PublicLayout>} />
          <Route path={t('/achat-envoi', '/shop-and-ship')} element={<PublicLayout><ShopAndShip /></PublicLayout>} />
          <Route path={t('/achat-envoi/:slug', '/shop-and-ship/:slug')} element={<PublicLayout><ShopAndShipProduct /></PublicLayout>} />
          <Route path={t('/reexpedition', '/international-forwarding')} element={<PublicLayout><Forwarding /></PublicLayout>} />
          <Route path="/blog" element={<PublicLayout><BlogIndex /></PublicLayout>} />
          <Route path="/blog/:slug" element={<PublicLayout><BlogPost /></PublicLayout>} />

          {/* Auth — plain shell (no Navbar/Footer, focused card) */}
          <Route path={t('/connexion', '/login')} element={<Login />} />
          <Route path={t('/inscription', '/signup')} element={<Signup />} />
          <Route path={t('/mot-de-passe-oublie', '/forgot-password')} element={<ForgotPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Client area — protected, inside AccountShell */}
          <Route element={<ProtectedRoute><AccountShell /></ProtectedRoute>}>
            <Route path={t('/compte', '/account')} element={<Account />} />
            <Route path={t('/compte/commandes', '/account/orders')} element={<AccountOrders />} />
            <Route path={t('/compte/factures', '/account/invoices')} element={<AccountInvoices />} />
          </Route>

          {/* Admin — FR-only convention. AdminGate wraps ProtectedRoute so a
              signed-in-but-not-admin user gets the "access denied" card, not
              a login redirect (which hides why the URL doesn't work). RLS is
              the real security boundary; this is UX. */}
          <Route element={<ProtectedRoute><AdminGate><AdminShell /></AdminGate></ProtectedRoute>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/destinations" element={<AdminCities />} />
            <Route path="/admin/produits" element={<AdminProducts />} />
            <Route path="/admin/commandes" element={<AdminOrders />} />
            <Route path="/admin/demandes-reexpedition" element={<AdminForwardingRequests />} />
            <Route path="/admin/auth-sociale" element={<AdminAuthProviders />} />
            <Route path="/admin/contenus" element={<AdminContent />} />
            <Route path="/admin/blog" element={<AdminBlog />} />
            <Route path="/admin/blog/nouveau" element={<AdminBlogForm />} />
            <Route path="/admin/blog/:id" element={<AdminBlogForm />} />
            <Route path="/admin/collaborateurs" element={<AdminCollaborators />} />
          </Route>

          <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

const AppRoutes = () => (
  <>
    <LanguageSync />
    <HreflangTags />
    <Routes>
      <Route path="/en/*" element={<PageRoutes lang="en" />} />
      <Route path="/*" element={<PageRoutes lang="fr" />} />
    </Routes>
  </>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EditModeProvider>
          <SiteContentProvider>
            <CartProvider>
              <Toaster richColors position="top-right" />
              <BrowserRouter>
                <LangUrlProvider>
                  <AppRoutes />
                </LangUrlProvider>
              </BrowserRouter>
            </CartProvider>
          </SiteContentProvider>
        </EditModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
