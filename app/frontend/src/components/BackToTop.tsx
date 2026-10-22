import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp } from 'lucide-react';

/** Floating "back to top" button, bottom-left (the support chat owns bottom-right). */
export function BackToTop() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label={t('blog.back_to_top')}
      title={t('blog.back_to_top')}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-luna-navy text-white shadow-xl transition-all duration-200 hover:bg-luna-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-aqua ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
