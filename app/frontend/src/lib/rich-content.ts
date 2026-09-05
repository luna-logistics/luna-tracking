import DOMPurify from 'dompurify';

/**
 * Sanitize HTML pasted into the RichTextEditor. Clipboard from Word / Google
 * Docs / Notes carries font-family + font-size inline styles that would
 * override the site type scale — strip them, keep only color +
 * background-color spans (what our toolbar produces).
 */
export function cleanPastedHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  tmp.querySelectorAll('style,meta,link,script,base,title').forEach((el) => el.remove());

  const unwrap = (el: Element) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  };

  tmp.querySelectorAll('font').forEach(unwrap);

  const nsElements: Element[] = [];
  const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_ELEMENT);
  let cur = walker.nextNode();
  while (cur) {
    const el = cur as Element;
    if (el.tagName.includes(':')) nsElements.push(el);
    cur = walker.nextNode();
  }
  nsElements.forEach(unwrap);

  tmp.querySelectorAll<HTMLElement>('*').forEach((el) => {
    el.removeAttribute('class');
    el.removeAttribute('id');
    el.removeAttribute('lang');
    const style = el.getAttribute('style');
    if (style) {
      const kept = style
        .split(';').map((s) => s.trim())
        .filter((decl) => {
          const prop = decl.split(':')[0]?.trim().toLowerCase();
          return prop === 'color' || prop === 'background-color';
        })
        .join('; ');
      if (kept) el.setAttribute('style', kept + ';');
      else el.removeAttribute('style');
    }
  });

  tmp.querySelectorAll('span').forEach((el) => {
    if (el.attributes.length === 0) unwrap(el);
  });

  tmp.querySelectorAll('p').forEach((p) => {
    const text = p.textContent?.replace(/\u00A0/g, '').trim();
    if (!text && !p.querySelector('img,br')) p.remove();
  });

  return tmp.innerHTML;
}

/**
 * Demote every <h1> in the sanitized HTML to <h2> — the public page already
 * owns the single page-level <h1>, so a second one in body content is a
 * duplicate-<h1> SEO defect.
 */
function demoteH1ToH2(html: string): string {
  if (typeof window === 'undefined') return html;
  if (!/<h1[\s>]/i.test(html)) return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('h1').forEach((h1) => {
    const h2 = document.createElement('h2');
    for (const attr of Array.from(h1.attributes)) h2.setAttribute(attr.name, attr.value);
    h2.innerHTML = h1.innerHTML;
    h1.replaceWith(h2);
  });
  return tmp.innerHTML;
}

const BASE_TAGS = [
  'p', 'br', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'a', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];
const BASE_ATTR = ['href', 'target', 'rel', 'style', 'class'];

/** Wider sanitizer for admin-authored blog posts — allows <img> and <figure>. */
const BLOG_TAGS = [...BASE_TAGS, 'figure', 'figcaption', 'img'];
const BLOG_ATTR = [...BASE_ATTR, 'src', 'alt', 'srcset', 'sizes', 'loading', 'decoding'];

export function sanitizeBlogHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  return demoteH1ToH2(
    DOMPurify.sanitize(html, {
      ALLOWED_TAGS: BLOG_TAGS,
      ALLOWED_ATTR: BLOG_ATTR,
      ADD_ATTR: ['target', 'rel'],
    })
  );
}
