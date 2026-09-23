import { supabase } from '@/lib/supabase';

/** Office e-mail send log (public.office_notifications). Every public
 *  submission — support message / quote request, forwarding request,
 *  order — is queued there by a DB trigger and the support-notify Edge
 *  Function writes the outcome back. Read + retry are admin-only RPCs. */

export const OFFICE_NOTIFICATION_STATUSES = ['pending', 'sending', 'sent', 'skipped', 'failed'] as const;
export type OfficeNotificationStatus = (typeof OFFICE_NOTIFICATION_STATUSES)[number];
export type OfficeNotificationKind = 'support_message' | 'forwarding_request' | 'order' | 'client_reply';

export type OfficeNotification = {
  id: string;
  kind: OfficeNotificationKind;
  record_id: string;
  status: OfficeNotificationStatus;
  detail: string | null;
  resend_id: string | null;
  created_at: string;
  updated_at: string;
  label: string | null;
  contact: string | null;
  conversation_id: string | null;
  /** The submission's actual content (message body / request description /
   *  order lines) so the admin can read it without the e-mail. */
  body: string | null;
};

export async function fetchOfficeNotifications(
  status: OfficeNotificationStatus | null = null, limit = 100,
): Promise<OfficeNotification[]> {
  const { data, error } = await supabase.rpc('admin_list_office_notifications', {
    p_status: status, p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as OfficeNotification[];
}

export async function retryOfficeNotification(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_retry_office_notification', { p_id: id });
  if (error) throw error;
}
