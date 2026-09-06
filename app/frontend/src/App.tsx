import { Toaster } from '@/components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { BusinessProvider } from '@/contexts/BusinessContext';
import { CartProvider } from '@/contexts/CartContext';
import { SiteContentProvider } from '@/contexts/SiteContentContext';
import { EditModeProvider } from '@/contexts/EditModeContext';
import { LangUrlProvider } from '@/contexts/LangUrlContext';
import { HreflangTags } from '@/components/HreflangTags';
import { PublicLayout } from '@/components/PublicLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminGate } from '@/components/AdminGate';
import { OnboardingGate, AccountTypeGate } from '@/components/AccountTypeGate';
import { setVisitLanguage } from '@/i18n';
import { Package, FileText, Users as UsersIcon, Receipt, Wallet, BarChart3, Files, MapPin } from 'lucide-react';

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
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const BusinessShell = lazy(() => import('@/components/BusinessShell').then((m) => ({ default: m.BusinessShell })));
const BusinessDashboard = lazy(() => import('@/pages/BusinessDashboard'));
const BusinessCreate = lazy(() => import('@/pages/BusinessCreate'));
const BusinessTeam = lazy(() => import('@/pages/BusinessTeam'));
const BusinessSettings = lazy(() => import('@/pages/BusinessSettings'));
const BusinessClients = lazy(() => import('@/pages/BusinessClients'));
const BusinessClientForm = lazy(() => import('@/pages/BusinessClientForm'));
const BusinessClientDetail = lazy(() => import('@/pages/BusinessClientDetail'));
const BusinessShipments = lazy(() => import('@/pages/BusinessShipments'));
const BusinessShipmentForm = lazy(() => import('@/pages/BusinessShipmentForm'));
const BusinessShipmentDetail = lazy(() => import('@/pages/BusinessShipmentDetail'));
// Placeholder pages — shell + URL work today, real modules in phases 3–8.
const BusinessPlaceholder = lazy(() => import('@/pages/BusinessPlaceholder').then((m) => ({ default: m.BusinessPlaceholder })));
const BusinessPlaceholderShipments = () => <BusinessPlaceholder icon={Package}   titleKey="business_nav.shipments"  bodyKey="business_placeholder.shipments_body" />;
const BusinessPlaceholderQuotes    = () => <BusinessPlaceholder icon={FileText}  titleKey="business_nav.quotes"     bodyKey="business_placeholder.quotes_body" />;
const BusinessPlaceholderClients   = () => <BusinessPlaceholder icon={UsersIcon} titleKey="business_nav.clients"    bodyKey="business_placeholder.clients_body" />;
const BusinessPlaceholderInvoicing = () => <BusinessPlaceholder icon={Receipt}   titleKey="business_nav.invoicing"  bodyKey="business_placeholder.invoicing_body" />;
const BusinessPlaceholderExpenses  = () => <BusinessPlaceholder icon={Wallet}    titleKey="business_nav.expenses"   bodyKey="business_placeholder.expenses_body" />;
const BusinessPlaceholderReports   = () => <BusinessPlaceholder icon={BarChart3} titleKey="business_nav.reports"    bodyKey="business_placeholder.reports_body" />;
const BusinessPlaceholderDocuments = () => <BusinessPlaceholder icon={Files}     titleKey="business_nav.documents"  bodyKey="business_placeholder.documents_body" />;
const BusinessPlaceholderAddresses = () => <BusinessPlaceholder icon={MapPin}    titleKey="business_nav.addresses"  bodyKey="business_placeholder.addresses_body" />;
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
const AdminCustomPages = lazy(() => import('@/pages/AdminCustomPages'));
const AdminCustomPageForm = lazy(() => import('@/pages/AdminCustomPageForm'));
const CustomPage = lazy(() => import('@/pages/CustomPage'));
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

          {/* Onboarding — protected, no shell (focused first-run pick) */}
          <Route
            path={t('/bienvenue', '/welcome')}
            element={<ProtectedRoute><Onboarding /></ProtectedRoute>}
          />

          {/* Client area (particulier) — protected + gated by
              account_type='individual'. A business user hitting a
              /compte URL is bounced to /entreprise by AccountTypeGate. */}
          <Route element={
            <ProtectedRoute>
              <OnboardingGate>
                <AccountTypeGate expect="individual">
                  <AccountShell />
                </AccountTypeGate>
              </OnboardingGate>
            </ProtectedRoute>
          }>
            <Route path={t('/compte', '/account')} element={<Account />} />
            <Route path={t('/compte/commandes', '/account/orders')} element={<AccountOrders />} />
            <Route path={t('/compte/factures', '/account/invoices')} element={<AccountInvoices />} />
          </Route>

          {/* Business area — protected + gated by account_type='business'.
              The /entreprise/nouvelle create-business page lives OUTSIDE
              the shell (a user with no business yet has nothing to show
              in the sidebar); every other business route is inside the
              BusinessShell, which handles the "no business yet" redirect
              itself. */}
          <Route
            path={t('/entreprise/nouvelle', '/business/new')}
            element={
              <ProtectedRoute>
                <OnboardingGate>
                  <AccountTypeGate expect="business">
                    <BusinessCreate />
                  </AccountTypeGate>
                </OnboardingGate>
              </ProtectedRoute>
            }
          />
          <Route element={
            <ProtectedRoute>
              <OnboardingGate>
                <AccountTypeGate expect="business">
                  <BusinessShell />
                </AccountTypeGate>
              </OnboardingGate>
            </ProtectedRoute>
          }>
            <Route path={t('/entreprise',              '/business')}              element={<BusinessDashboard />} />
            <Route path={t('/entreprise/expeditions',  '/business/shipments')}    element={<BusinessShipments />} />
            <Route path={t('/entreprise/expeditions/new', '/business/shipments/new')} element={<BusinessShipmentForm />} />
            <Route path={t('/entreprise/expeditions/:id/edit', '/business/shipments/:id/edit')} element={<BusinessShipmentForm />} />
            <Route path={t('/entreprise/expeditions/:id', '/business/shipments/:id')} element={<BusinessShipmentDetail />} />
            <Route path={t('/entreprise/devis',        '/business/quotes')}       element={<BusinessPlaceholderQuotes />} />
            <Route path={t('/entreprise/clients',      '/business/clients')}      element={<BusinessClients />} />
            <Route path={t('/entreprise/clients/new',  '/business/clients/new')}  element={<BusinessClientForm />} />
            <Route path={t('/entreprise/clients/:id/edit', '/business/clients/:id/edit')} element={<BusinessClientForm />} />
            <Route path={t('/entreprise/clients/:id',  '/business/clients/:id')}  element={<BusinessClientDetail />} />
            <Route path={t('/entreprise/facturation',  '/business/invoicing')}    element={<BusinessPlaceholderInvoicing />} />
            <Route path={t('/entreprise/depenses',     '/business/expenses')}     element={<BusinessPlaceholderExpenses />} />
            <Route path={t('/entreprise/rapports',     '/business/reports')}      element={<BusinessPlaceholderReports />} />
            <Route path={t('/entreprise/documents',    '/business/documents')}    element={<BusinessPlaceholderDocuments />} />
            <Route path={t('/entreprise/adresses',     '/business/addresses')}    element={<BusinessPlaceholderAddresses />} />
            <Route path={t('/entreprise/equipe',       '/business/team')}         element={<BusinessTeam />} />
            <Route path={t('/entreprise/parametres',   '/business/settings')}     element={<BusinessSettings />} />
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
            <Route path="/admin/pages" element={<AdminCustomPages />} />
            <Route path="/admin/pages/nouvelle" element={<AdminCustomPageForm />} />
            <Route path="/admin/pages/:id" element={<AdminCustomPageForm />} />
          </Route>

          {/* Admin-authored top-level pages — /:slug (FR) and /en/:slug (EN).
              React Router v6 ranks static routes above single-param routes so
              /suivi, /tarifs, /blog, /admin, ... still win. Unknown slugs fall
              through to CustomPage, which shows a real noindex 404 rather than
              serving the FR homepage canonical (last summer's leak). */}
          <Route path="/:slug" element={<PublicLayout><CustomPage /></PublicLayout>} />

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
        <ProfileProvider>
          <BusinessProvider>
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
          </BusinessProvider>
        </ProfileProvider>
      </AuthProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
