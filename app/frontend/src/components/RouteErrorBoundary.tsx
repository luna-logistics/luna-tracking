import { Component, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Route-level safety net. Without it, an uncaught render error (lazy chunk
 * failure, page throw during render, etc.) collapses to a blank white viewport
 * with no recovery path. This paints an honest recovery card + two doors
 * (reload / home).
 */
type State = { error: Error | null };

class RouteErrorBoundaryInner extends Component<WithTranslation & { children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('[route-error]', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const { t } = this.props;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full rounded-2xl border-2 border-luna-blue bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="h-8 w-8 text-luna-navy mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-luna-navy">{t('route_error.title')}</h1>
          <p className="mt-2 text-sm text-slate-700">{t('route_error.body')}</p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="navy" onClick={() => window.location.reload()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('route_error.reload')}
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = '/'; }}>
              {t('route_error.home')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export const RouteErrorBoundary = withTranslation()(RouteErrorBoundaryInner);
