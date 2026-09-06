import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X, User, LayoutDashboard, Pencil, PencilOff, LogOut } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { urlFor } from '@/lib/url/routes';
import { useAuth } from '@/contexts/AuthContext';
import { useEditMode } from '@/contexts/EditModeContext';
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
  const { editMode, toggle: toggleEdit } = useEditMode();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && path !== '/en' && location.pathname.startsWith(path));

  const links = [
    { to: urlFor('home', lang), label: t('nav.home') },
    { to: urlFor('tracking', lang), label: t('nav.tracking') },
    { to: urlFor('shopAndShip', lang), label: t('nav.shop_and_ship') },
    { to: urlFor('forwarding', lang), label: t('nav.forwarding') },
    { to: urlFor('blogIndex', lang), label: t('nav.blog') },
    { to: urlFor('pricing', lang), label: t('nav.pricing') },
    { to: urlFor('contact', lang), label: t('nav.contact') },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to={urlFor('home', lang)} className="shrink-0 flex items-center gap-2" aria-label={t('brand.name')}>
          {/* Horizontal 1600×400 (4:1) — phoenix + wordmark on one line. At
              h-10 (40px) the width is 160px and the wordmark stays crisp.
              `shrink-0` + explicit intrinsic size keeps the logo from being
              squeezed when the nav row gets crowded. */}
          <img
            src="/brand/logo-luna-navbar2.png"
            alt={t('brand.name')}
            className="h-10 w-40 object-contain"
            width={160}
            height={40}
          />
        </Link>

        <nav className="hidden lg:flex items-center gap-0.5 min-w-0" aria-label={t('nav.home')}>
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                'rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                isActive(l.to)
                  ? 'text-luna-navy bg-luna-navy/10'
                  : 'text-slate-700 hover:text-luna-navy hover:bg-luna-navy/5'
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex shrink-0 items-center gap-2">
          <LanguageSwitcher variant="light" />
          {user ? (
            <>
              {isAdmin && (
                <button
                  type="button"
                  onClick={toggleEdit}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md h-9 w-9 transition-colors',
                    editMode
                      ? 'bg-luna-cyan text-luna-navy'
                      : 'text-luna-navy hover:bg-luna-navy/5 border border-slate-200'
                  )}
                  title={editMode ? t('edit_mode.exit') : t('edit_mode.enter')}
                  aria-label={editMode ? t('edit_mode.exit') : t('edit_mode.enter')}
                >
                  {editMode ? <PencilOff className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </button>
              )}
              {isAdmin && (
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1 rounded-md bg-luna-cyan/20 px-2.5 py-2 text-sm font-semibold text-luna-navy hover:bg-luna-cyan/30"
                  title={t('nav.admin')}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden xl:inline">{t('nav.admin')}</span>
                </Link>
              )}
              <Link
                to={urlFor('account', lang)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium text-luna-navy hover:bg-luna-navy/5"
                title={t('nav.account')}
              >
                <User className="h-4 w-4" />
                <span className="hidden xl:inline">{t('nav.account')}</span>
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-500 hover:text-luna-navy hover:bg-luna-navy/5"
                title={t('nav.logout')}
                aria-label={t('nav.logout')}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Link
                to={urlFor('login', lang)}
                className="rounded-md px-2.5 py-2 text-sm font-medium text-luna-navy hover:bg-luna-navy/5 whitespace-nowrap"
              >
                {t('nav.login')}
              </Link>
              <Link
                to={urlFor('signup', lang)}
                className="rounded-md bg-luna-navy px-2.5 py-2 text-sm font-semibold text-white hover:bg-luna-navy/90 whitespace-nowrap"
              >
                {t('nav.signup')}
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-luna-navy hover:bg-luna-navy/5"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-slate-200 bg-white">
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
