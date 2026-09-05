import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Session-scoped cart. Persists in sessionStorage so a page reload keeps the
 * cart, but a new browser session starts empty (no long-lived "abandoned"
 * carts). Cart snapshot is copied into `orders.items` at checkout so a later
 * product price change never rewrites what the customer paid for.
 */

export type CartLine = {
  product_id: string;
  slug: string;
  name: string;
  unit_price: number;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  add: (line: Omit<CartLine, 'quantity'>, qty?: number) => void;
  setQty: (product_id: string, qty: number) => void;
  remove: (product_id: string) => void;
  clear: () => void;
  total: number;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'luna_cart_v1';

function readInitial(): CartLine[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l) => l && typeof l.product_id === 'string' && typeof l.quantity === 'number' && l.quantity > 0
    );
  } catch { return []; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readInitial);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines)); } catch { /* non-fatal */ }
  }, [lines]);

  const add: CartContextValue['add'] = (line, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === line.product_id);
      if (existing) {
        return prev.map((l) => l.product_id === line.product_id ? { ...l, quantity: l.quantity + qty } : l);
      }
      return [...prev, { ...line, quantity: qty }];
    });
  };

  const setQty: CartContextValue['setQty'] = (product_id, qty) => {
    setLines((prev) => {
      if (qty <= 0) return prev.filter((l) => l.product_id !== product_id);
      return prev.map((l) => l.product_id === product_id ? { ...l, quantity: qty } : l);
    });
  };

  const remove: CartContextValue['remove'] = (product_id) => {
    setLines((prev) => prev.filter((l) => l.product_id !== product_id));
  };

  const clear = () => setLines([]);

  const total = useMemo(() => lines.reduce((s, l) => s + l.unit_price * l.quantity, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  return (
    <CartContext.Provider value={{ lines, add, setQty, remove, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
