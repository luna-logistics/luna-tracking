import { supabase } from '@/lib/supabase';

export const ORDER_STATUSES = [
  'pending_payment', 'paid', 'purchasing', 'purchased', 'shipped', 'delivered', 'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Linear workflow: given the current status, what's the next allowed one?
 *  `cancelled` and `delivered` are terminal — no next step. */
export function nextStatus(s: OrderStatus): OrderStatus | null {
  const flow: OrderStatus[] = ['pending_payment', 'paid', 'purchasing', 'purchased', 'shipped', 'delivered'];
  const i = flow.indexOf(s);
  if (i < 0 || i === flow.length - 1) return null;
  return flow[i + 1];
}

export type OrderItem = {
  product_id: string;
  slug: string;
  name: string;
  quantity: number;
  unit_price: number;
};

export type Order = {
  id: string;
  user_id: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  recipient_name: string;
  recipient_phone: string;
  recipient_city_id: string | null;
  recipient_address: string;
  notes: string | null;
  created_at: string;
};

/** Lines only need `product_id`, `quantity` and the slug the customer shopped
 *  with: the `orders_reprice` trigger rebuilds price, name and total from the
 *  catalogue and forces `pending_payment`. Never send a total or a status. */
export type NewOrder = Omit<Order, 'id' | 'created_at' | 'status' | 'total' | 'items'> & {
  items: Array<Pick<OrderItem, 'product_id' | 'slug' | 'quantity'>>;
};

/** Thrown when the server refuses a line (product removed/deactivated since
 *  the cart was built, or a malformed quantity). */
export class OrderRejectedError extends Error {
  constructor(public reason: 'product_unavailable' | 'invalid') { super(reason); }
}

export async function createOrder(order: NewOrder): Promise<Order> {
  const { data, error } = await supabase.from('orders').insert(order).select().single();
  if (error) {
    if (error.message?.startsWith('order_product_unavailable')) throw new OrderRejectedError('product_unavailable');
    if (/^order_item(s)?_/.test(error.message ?? '')) throw new OrderRejectedError('invalid');
    throw error;
  }
  return data as Order;
}

export async function fetchMyOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.warn('[orders] fetchMy failed:', error.message); return []; }
  return (data ?? []) as Order[];
}

export async function fetchAllOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.warn('[orders] fetchAll failed:', error.message); return []; }
  return (data ?? []) as Order[];
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}
