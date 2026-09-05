import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X, User, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { urlFor } from '@/lib/url/routes';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

/**
 * Site header. White ground so the on-white logo reads correctly; navy CTA
 * text keeps the brand present without competing with the hero band below.
 */
export function Navbar() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && path !== '/en' && location.pathname.startsWith(path));

  const links = [
    { to: urlFor('home', lang), label: t('nav.home') },
    { to: urlFor('tracking', lang), label: t('nav.tracking') },
    { to: urlFor('shopAndShip', lang), label: t('nav.shop_and_ship') },
    { to: urlFor('forwarding', lang), label: t('nav.forwarding') },
    { to: urlFor('pricing', lang), label: t('nav.pricing') },
    { to: urlFor('contact', lang), label: t('nav.contact') },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to={urlFor('home', lang)} className="flex items-center gap-2" aria-label={t('brand.name')}>
          {/* Horizontal 1600×400 (4:1) — phoenix + wordmark on one line. At
              h-10 (40px) the width is 160px and the wordmark stays crisp. */}
          <img
            src="/brand/logo-luna-navbar.png"
            alt={t('brand.name')}
            className="h-10 w-auto"
            width={160}
            height={40}
          />
        </Link>

        <nav className="hidden md:flex items-center gap-1" aria-label={t('nav.home')}>
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive(l.to)
                  ? 'text-luna-navy bg-luna-navy/10'
                  : 'text-slate-700 hover:text-luna-navy hover:bg-luna-navy/5'
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <LanguageSwitcher variant="light" />
          {user ? (
            <>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1 rounded-md bg-luna-cyan/20 px-3 py-2 text-sm font-semibold text-luna-navy hover:bg-luna-cyan/30"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {t('nav.admin')}
                </Link>
              )}
              <Link
                to={urlFor('account', lang)}
                className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-luna-navy hover:bg-luna-navy/5"
              >
                <User className="h-4 w-4" />
                {t('nav.account')}
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="text-xs text-slate-500 hover:text-luna-navy"
              >
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link
                to={urlFor('login', lang)}
                className="rounded-md px-3 py-2 text-sm font-medium text-luna-navy hover:bg-luna-navy/5"
              >
                {t('nav.login')}
              </Link>
              <Link
                to={urlFor('signup', lang)}
                className="rounded-md bg-luna-navy px-3 py-2 text-sm font-semibold text-white hover:bg-luna-navy/90"
              >
                {t('nav.signup')}
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-luna-navy hover:bg-luna-navy/5"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium',
                  isActive(l.to)
                    ? 'text-luna-navy bg-luna-navy/10'
                    : 'text-slate-700 hover:text-luna-navy hover:bg-luna-navy/5'
                )}
              >
                {l.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="rounded-md bg-luna-cyan/20 px-3 py-2 text-sm font-semibold text-luna-navy hover:bg-luna-cyan/30 inline-flex items-center gap-1"
              >
                <LayoutDashboard className="h-4 w-4" />
                {t('nav.admin')}
              </Link>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
              <LanguageSwitcher variant="light" />
              {user ? (
                <button
                  type="button"
                  onClick={() => { void signOut(); setOpen(false); }}
                  className="text-sm text-luna-navy"
                >
                  {t('nav.logout')}
                </button>
              ) : (
                <Link
                  to={urlFor('login', lang)}
                  onClick={() => setOpen(false)}
                  className="text-sm font-semibold text-luna-navy"
                >
                  {t('nav.login')}
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
