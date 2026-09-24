import { useTranslation } from 'react-i18next';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { RowActionsMenu } from '@/components/RowActionsMenu';

/** "…" menu on each inbox row: delete (soft, confirmed) — or restore in the
 *  deleted view — without having to open the conversation first. */
export function ConversationRowMenu({ deleted, label, onDelete, onRestore }: {
  deleted: boolean; label: string; onDelete: () => void; onRestore: () => void;
}) {
  const { t } = useTranslation();
  return (
    <RowActionsMenu className="!absolute right-1.5 top-2" label={t('admin_support.row_actions', { name: label })}
      actions={deleted
        ? [{ key: 'restore', label: t('admin_support.restore'), icon: ArchiveRestore, onSelect: onRestore }]
        : [{ key: 'delete', label: t('admin_support.delete'), icon: Trash2, onSelect: onDelete, danger: true }]} />
  );
}
