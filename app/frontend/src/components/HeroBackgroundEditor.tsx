import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Trash2, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  saveSiteImage, saveHeroConfig, deleteSiteImage, uploadSiteImage,
  DEFAULT_HERO_CONFIG, type HeroConfig,
} from '@/lib/site-content';
import { useSiteContentContext, useHeroBg } from '@/contexts/SiteContentContext';
import { cn } from '@/lib/utils';

type Props = {
  imageKey: string;
  labelFr: string;
  labelEn: string;
  hintFr?: string;
  hintEn?: string;
  uiLang: 'fr' | 'en';
};

/**
 * Editor for a page's hero background photo.
 *
 * Layout mirrors the public hero band (16:9 preview) so the admin sees
 * exactly what visitors will see. Focal point can be dragged directly on
 * the preview (pointer events, no external library); zoom + overlay are
 * two sliders below. Save is per-field so a slip on one knob doesn't
 * wipe the others.
 */
export function HeroBackgroundEditor({
  imageKey, labelFr, labelEn, hintFr, hintEn, uiLang,
}: Props) {
  const { t } = useTranslation();
  const ctx = useSiteContentContext();
  const stored = useHeroBg(imageKey);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<HeroConfig>(
    stored ? { focal_x: stored.focal_x, focal_y: stored.focal_y, zoom: stored.zoom, overlay: stored.overlay }
           : DEFAULT_HERO_CONFIG
  );

  // Re-sync draft whenever another editor / refresh updates the row.
  useEffect(() => {
    if (stored) setDraft({ focal_x: stored.focal_x, focal_y: stored.focal_y, zoom: stored.zoom, overlay: stored.overlay });
    else setDraft(DEFAULT_HERO_CONFIG);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.url, stored?.focal_x, stored?.focal_y, stored?.zoom, stored?.overlay]);

  const dirty = !!stored && (
    draft.focal_x !== stored.focal_x || draft.focal_y !== stored.focal_y ||
    draft.zoom    !== stored.zoom    || draft.overlay !== stored.overlay
  );

  const label = uiLang === 'en' ? labelEn : labelFr;
  const hint  = uiLang === 'en' ? hintEn  : hintFr;

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadSiteImage(imageKey, file);
      // Preserve any existing framing config; only overwrite the URL.
      await saveSiteImage(imageKey, url,
        stored ? { focal_x: stored.focal_x, focal_y: stored.focal_y, zoom: stored.zoom, overlay: stored.overlay } : DEFAULT_HERO_CONFIG);
      await ctx.refresh();
      toast.success(t('admin_content.hero_uploaded'));
    } catch (err) {
      console.error('[hero-bg] upload failed', err);
      toast.error(t('common.error_generic'));
    } finally { setUploading(false); }
  };

  const onRemove = async () => {
    if (!confirm(t('admin_content.hero_remove_confirm'))) return;
    try {
      await deleteSiteImage(imageKey);
      await ctx.refresh();
    } catch (err) {
      console.error('[hero-bg] remove failed', err);
      toast.error(t('common.error_generic'));
    }
  };

  const onSaveConfig = async () => {
    if (!stored?.url) return;
    setSaving(true);
    try {
      await saveHeroConfig(imageKey, draft);
      await ctx.refresh();
      toast.success(t('admin_content.hero_saved'));
    } catch (err) {
      console.error('[hero-bg] save-config failed', err);
      toast.error(t('common.error_generic'));
    } finally { setSaving(false); }
  };

  const onReset = () => setDraft(DEFAULT_HERO_CONFIG);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-sm font-semibold text-luna-navy">{label}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}

      {/* Preview + drag-to-focal-point */}
      <div className="mt-4 space-y-3">
        <FocalPreview
          url={stored?.url ?? null}
          config={draft}
          onFocalChange={(x, y) => setDraft((d) => ({ ...d, focal_x: x, focal_y: y }))}
        />

        {/* Upload / remove — always visible */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-md bg-luna-navy text-white px-3 py-2 text-sm font-medium cursor-pointer hover:bg-luna-navy/90">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? t('admin_content.uploading') : (stored?.url ? t('admin_content.hero_replace') : t('admin_content.hero_upload'))}
            <input
              type="file" className="hidden" accept="image/*" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          {stored?.url && (
            <>
              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={onRemove}>
                <Trash2 className="h-3.5 w-3.5" />
                {t('admin_content.hero_remove')}
              </Button>
              <span className="text-xs text-slate-400">
                {t('admin_content.hero_drag_hint')}
              </span>
            </>
          )}
        </div>

        {/* Sliders — only meaningful when a photo is set */}
        {stored?.url && (
          <div className="grid gap-4 sm:grid-cols-2">
            <RangeField
              label={t('admin_content.hero_zoom')}
              min={100} max={200} step={1} suffix="%"
              value={draft.zoom}
              onChange={(v) => setDraft((d) => ({ ...d, zoom: v }))}
              hint={t('admin_content.hero_zoom_hint')}
            />
            <RangeField
              label={t('admin_content.hero_overlay')}
              min={0} max={90} step={1} suffix="%"
              value={draft.overlay}
              onChange={(v) => setDraft((d) => ({ ...d, overlay: v }))}
              hint={t('admin_content.hero_overlay_hint')}
            />
            <RangeField
              label={t('admin_content.hero_focal_x')}
              min={0} max={100} step={1} suffix="%"
              value={draft.focal_x}
              onChange={(v) => setDraft((d) => ({ ...d, focal_x: v }))}
            />
            <RangeField
              label={t('admin_content.hero_focal_y')}
              min={0} max={100} step={1} suffix="%"
              value={draft.focal_y}
              onChange={(v) => setDraft((d) => ({ ...d, focal_y: v }))}
            />
          </div>
        )}

        {stored?.url && (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onReset} className="text-slate-500 hover:text-luna-navy">
              <RotateCcw className="h-3.5 w-3.5" />
              {t('admin_content.hero_reset')}
            </Button>
            <Button size="sm" variant={dirty ? 'navy' : 'outline'} disabled={!dirty || saving} onClick={onSaveConfig}>
              <Save className="h-3.5 w-3.5" />
              {saving ? t('admin_content.saving') : t('admin_content.save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 16:9 preview of the current photo with a draggable focal-point crosshair.
 * Click anywhere to move the point; drag to fine-tune. Pointer events cover
 * touch + mouse without extra libraries.
 */
function FocalPreview({
  url, config, onFocalChange,
}: {
  url: string | null;
  config: HeroConfig;
  onFocalChange: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const moveTo = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top)  / rect.height) * 100));
    onFocalChange(Math.round(x), Math.round(y));
  };

  return (
    <div
      ref={ref}
      className={cn(
        'relative w-full rounded-lg overflow-hidden bg-luna-navy-deep select-none',
        url ? 'cursor-crosshair' : 'cursor-default',
      )}
      style={{ aspectRatio: '16 / 9' }}
      onPointerDown={(e) => {
        if (!url) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDragging(true);
        moveTo(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => { if (dragging) moveTo(e.clientX, e.clientY); }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      {url ? (
        <>
          <div
            className="absolute inset-0 bg-no-repeat bg-cover"
            style={{
              backgroundImage: `url(${url})`,
              backgroundPosition: `${config.focal_x}% ${config.focal_y}%`,
              backgroundSize: `${config.zoom}%`,
            }}
          />
          <div
            className="absolute inset-0 bg-luna-navy-deep"
            style={{ opacity: config.overlay / 100 }}
          />
          {/* Focal crosshair */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${config.focal_x}%`, top: `${config.focal_y}%` }}
          >
            <div className="h-6 w-6 rounded-full ring-2 ring-white bg-white/20 shadow-lg" />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">
          <span>16:9</span>
        </div>
      )}
    </div>
  );
}

function RangeField({
  label, hint, min, max, step, suffix, value, onChange,
}: {
  label: string; hint?: string;
  min: number; max: number; step: number; suffix?: string;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-xs font-semibold text-luna-navy">
        <span>{label}</span>
        <span className="text-slate-500">{value}{suffix ?? ''}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-luna-navy mt-1"
      />
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </label>
  );
}
