import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X, UserCircle, LayoutDashboard, Pencil, PencilOff, LogOut } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { urlFor } from '@/lib/url/routes';
import { useAuth } from '@/contexts/AuthContext';
import { useEditMode } from '@/contexts/EditModeContext';
import { cn } from '@/lib/utils';

/**
 * Site header — navy design from the "Homepage Luna" redesign.
 *
 * Single-row layout at every desktop width: logo left, nav links centered,
 * language + account actions right — all vertically aligned on ONE line,
 * never a wrapped second tier. Below `navfull` (1100px) the centered links
 * collapse into a hamburger dropdown; the logo + right cluster stay on the
 * same single row.
 *
 * Everything functional is preserved: bilingual routing via `urlFor`, the
 * real LanguageSwitcher, auth-aware account/admin/edit/logout controls, and
 * the active-route highlight.
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

  const pill = (active: boolean) =>
    cn(
      'px-3 py-2 rounded-lg text-[13px] whitespace-nowrap transition-colors border',
      active
        ? 'bg-luna-aqua border-luna-aqua text-luna-ink font-semibold hover:bg-luna-aqua2 hover:border-luna-aqua2'
        : 'bg-luna-royal border-luna-hair text-[#E4EDF9] font-medium hover:bg-luna-azure hover:border-[#4A6FA0]',
    );

  return (
    <header className="sticky top-0 z-40 w-full bg-luna-ink border-b border-luna-aqua/20">
      <div className="mx-auto flex max-w-[1220px] flex-nowrap items-center gap-x-2 px-3 py-1.5 sm:gap-x-3 sm:px-8 lg:px-5 lg:py-2.5">
        {/* Logo — far left */}
        <Link to={urlFor('home', lang)} className="flex-none flex items-center gap-2.5" aria-label={t('brand.name')}>
          <img src="/brand/luna-icon.png" alt="" aria-hidden="true" className="block h-[30px] w-auto lg:h-11" width={44} height={44} />
          <span className="block leading-none">
            <span className="block text-[16px] font-semibold tracking-[0.055em] bg-luna-wordmark bg-clip-text text-transparent lg:text-[22px]">LUNA</span>
            <span className="mt-[2px] block text-[8.5px] font-medium tracking-[0.05em] text-luna-aqua whitespace-nowrap lg:mt-1 lg:text-[11px]">Tracking Logistics</span>
          </span>
        </Link>

        {/* Inline nav — centered, single row (>= navfull) */}
        <nav className="hidden navfull:flex flex-1 min-w-0 items-center justify-center gap-1.5 xl:gap-2" aria-label={t('nav.main_navigation')}>
          {links.map((l) => (
            <Link key={l.to} to={l.to} aria-current={isActive(l.to) ? 'page' : undefined} className={pill(isActive(l.to))}>
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right cluster — far right, always inline */}
        <div className="ml-auto navfull:ml-0 flex flex-none items-center gap-1.5 sm:gap-2">
          <LanguageSwitcher variant="dark" />

          {user ? (
            <>
              {isAdmin && (
                <button
                  type="button"
                  onClick={toggleEdit}
                  title={editMode ? t('edit_mode.exit') : t('edit_mode.enter')}
                  aria-label={editMode ? t('edit_mode.exit') : t('edit_mode.enter')}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors lg:h-10 lg:w-10',
                    editMode
                      ? 'bg-luna-aqua border-luna-aqua text-luna-ink'
                      : 'border-luna-hair text-luna-aqua hover:bg-luna-sky/20',
                  )}
                >
                  {editMode ? <PencilOff className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </button>
              )}
              {isAdmin && (
                <Link
                  to="/admin"
                  title={t('nav.admin')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-luna-hair text-luna-aqua hover:bg-luna-sky/20 lg:h-10 lg:w-10"
                >
                  <LayoutDashboard className="h-4 w-4" />
                </Link>
              )}
              <Link
                to={urlFor('account', lang)}
                className="inline-flex items-center gap-2 rounded-lg border border-luna-sky px-3 py-2 text-[13px] font-medium text-white hover:bg-luna-sky/20 whitespace-nowrap"
              >
                <UserCircle className="h-[18px] w-[18px] text-luna-aqua" />
                <span className="hidden sm:inline">{t('nav.account')}</span>
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                title={t('nav.logout')}
                aria-label={t('nav.logout')}
                className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-luna-hair text-[#B9C9E0] hover:text-white hover:bg-luna-sky/20 lg:h-10 lg:w-10"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link
              to={urlFor('login', lang)}
              className="inline-flex items-center gap-2 rounded-lg border border-luna-sky px-3 py-2 text-[13px] font-medium text-white hover:bg-luna-sky/20 whitespace-nowrap"
            >
              <UserCircle className="h-[18px] w-[18px] text-luna-aqua" />
              <span className="hidden sm:inline">{t('nav.account')}</span>
            </Link>
          )}

          {/* Hamburger — below navfull only */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t('nav.menu')}
            className="navfull:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-luna-sky text-luna-aqua hover:bg-luna-sky/20 lg:h-10 lg:w-10"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown — below navfull */}
      {open && (
        <nav id="mobile-nav" className="navfull:hidden border-t border-luna-hair bg-luna-ink px-4 sm:px-8 py-3 lg:px-5 lg:py-4" aria-label={t('nav.main_navigation')}>
          <div className="grid grid-cols-2 gap-1.5 lg:gap-2">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                aria-current={isActive(l.to) ? 'page' : undefined}
                className={cn(
                  'px-3 py-2.5 rounded-lg text-[12.5px] transition-colors border lg:px-4 lg:py-3 lg:text-[13px]',
                  isActive(l.to)
                    ? 'bg-luna-aqua border-luna-aqua text-luna-ink font-semibold'
                    : 'bg-luna-royal border-luna-hair text-[#E4EDF9] font-medium',
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
