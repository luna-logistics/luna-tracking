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
 * Site header — navy design from the "Homepage Luna" redesign (2026-09-14).
 *
 * Responsive nav mirrors the mockup's three tiers via CSS breakpoints
 * (added to tailwind.config as `navrow` 700 + `nav` 1240):
 *   - >= 1240 (`nav:`)      full inline pill nav in the header row
 *   - 700-1239 (`navrow:`)  nav wraps onto a full-width second row
 *   - < 700                 hamburger button + dropdown panel
 * The right cluster (language, account) stays in the top row at every width.
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
      'px-4 py-2 rounded-lg text-[13px] whitespace-nowrap transition-colors border',
      active
        ? 'bg-luna-aqua border-luna-aqua text-luna-ink font-semibold hover:bg-luna-aqua2 hover:border-luna-aqua2'
        : 'bg-luna-royal border-luna-hair text-[#E4EDF9] font-medium hover:bg-luna-azure hover:border-[#4A6FA0]',
    );

  const NavLinks = () => (
    <>
      {links.map((l) => (
        <Link key={l.to} to={l.to} aria-current={isActive(l.to) ? 'page' : undefined} className={pill(isActive(l.to))}>
          {l.label}
        </Link>
      ))}
    </>
  );

  return (
    <header className="sticky top-0 z-40 w-full bg-luna-ink border-b border-luna-aqua/20">
      <div className="mx-auto flex max-w-[1220px] flex-wrap items-center gap-x-4 gap-y-2.5 px-5 sm:px-8 py-2.5">
        {/* Logo: phoenix icon + wordmark, horizontal, side by side */}
        <Link to={urlFor('home', lang)} className="flex-none flex items-center gap-2.5" aria-label={t('brand.name')}>
          <img src="/brand/luna-icon.png" alt="" aria-hidden="true" className="block h-11 w-auto" width={44} height={44} />
          <span className="block leading-none">
            <span className="block text-[22px] font-semibold tracking-[0.055em] text-white">LUNA</span>
            <span className="mt-1 block text-[11px] font-medium tracking-[0.05em] text-luna-aqua whitespace-nowrap">Tracking Logistics</span>
          </span>
        </Link>

        {/* Full inline nav — desktop (>= 1240) */}
        <nav className="hidden nav:flex flex-wrap items-center gap-2" aria-label={t('nav.home')}>
          <NavLinks />
        </nav>

        {/* Right cluster — every width */}
        <div className="ml-auto flex items-center gap-2.5">
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
                    'inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-luna-hair text-luna-aqua hover:bg-luna-sky/20"
                >
                  <LayoutDashboard className="h-4 w-4" />
                </Link>
              )}
              <Link
                to={urlFor('account', lang)}
                className="inline-flex items-center gap-2 rounded-lg border border-luna-sky px-3.5 py-2 text-[13px] font-medium text-white hover:bg-luna-sky/20 whitespace-nowrap"
              >
                <UserCircle className="h-[18px] w-[18px] text-luna-aqua" />
                <span className="hidden sm:inline">{t('nav.account')}</span>
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                title={t('nav.logout')}
                aria-label={t('nav.logout')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-luna-hair text-[#B9C9E0] hover:text-white hover:bg-luna-sky/20"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link
              to={urlFor('login', lang)}
              className="inline-flex items-center gap-2 rounded-lg border border-luna-sky px-3.5 py-2 text-[13px] font-medium text-white hover:bg-luna-sky/20 whitespace-nowrap"
            >
              <UserCircle className="h-[18px] w-[18px] text-luna-aqua" />
              {t('nav.account')}
            </Link>
          )}

          {/* Hamburger — only below 700 */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
            className="navrow:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-luna-sky text-luna-aqua hover:bg-luna-sky/20"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Wrapped second-row nav — 700 to 1239 */}
        <nav className="hidden navrow:flex nav:hidden basis-full flex-wrap items-center gap-2 pb-1" aria-label={t('nav.home')}>
          <NavLinks />
        </nav>
      </div>

      {/* Mobile dropdown — below 700 */}
      {open && (
        <nav className="navrow:hidden border-t border-luna-hair bg-luna-ink px-5 sm:px-8 py-4">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                aria-current={isActive(l.to) ? 'page' : undefined}
                className={cn(
                  'px-4 py-3 rounded-lg text-[13px] transition-colors border',
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
