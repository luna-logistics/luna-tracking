export interface BlogTocItem {
  id: string;
  text: string;
  level: 2;
}

function slugify(text: string): string {
  const slug = text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= 60) return slug;
  const cut = slug.slice(0, 60);
  return cut.slice(0, Math.max(cut.lastIndexOf('-'), 20));
}

/**
 * Give every <h2>/<h3> of the (already sanitized) blog HTML a stable id and a
 * small "#" link, and return the table of contents (<h2> only: the <h3>s of
 * a long guide would bury the main sections). The sanitizer
 * strips ids on purpose, so they are added here, after it.
 */
export function addBlogAnchors(html: string): { html: string; toc: BlogTocItem[] } {
  if (typeof window === 'undefined' || !/<h[23][\s>]/i.test(html)) return { html, toc: [] };
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const used = new Set<string>();
  const toc: BlogTocItem[] = [];
  tmp.querySelectorAll('h2, h3').forEach((h) => {
    const text = h.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text) return;
    const base = slugify(text) || 'section';
    let id = base;
    for (let n = 2; used.has(id) || id === 'faq-heading'; n++) id = `${base}-${n}`;
    used.add(id);
    h.id = id;
    h.classList.add('blog-heading');
    const a = document.createElement('a');
    a.href = `#${id}`;
    a.className = 'blog-anchor';
    a.setAttribute('data-blog-anchor', '');
    a.setAttribute('aria-hidden', 'true');
    a.tabIndex = -1;
    a.textContent = '#';
    h.appendChild(a);
    if (h.tagName === 'H2') toc.push({ id, text, level: 2 });
  });
  return { html: tmp.innerHTML, toc };
}

/** Scroll smoothly to a section and keep the URL shareable. */
export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try { window.history.replaceState(null, '', `#${id}`); } catch { /* ignore */ }
}
