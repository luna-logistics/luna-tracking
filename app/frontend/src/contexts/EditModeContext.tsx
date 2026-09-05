import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Toggle for the site-wide "edit in place" overlay.
 *
 * When an admin flips it on, every <Ed> component around a text becomes
 * click-to-edit; saving writes to site_content and the change is visible
 * on the page immediately (via SiteContentContext.refresh()).
 *
 * Persisted in sessionStorage so a page navigation doesn't lose the mode
 * during an editing session; NOT persisted across sessions — closing the
 * tab is a natural exit that avoids leaving the mode dangling.
 *
 * Non-admin users can never enable it (useAuth gates the setter).
 */

type Ctx = {
  editMode: boolean;
  canEdit: boolean;
  toggle: () => void;
  setEditMode: (v: boolean) => void;
};

const STORAGE_KEY = 'luna_edit_mode_v1';

const EditModeContext = createContext<Ctx>({
  editMode: false, canEdit: false, toggle: () => {}, setEditMode: () => {},
});

export function EditModeProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const [editMode, setEditModeState] = useState<boolean>(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try {
      if (editMode) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* non-fatal */ }
  }, [editMode]);

  // Auto-disable if the user is no longer an admin (signed out, revoked, etc.).
  useEffect(() => { if (!isAdmin && editMode) setEditModeState(false); }, [isAdmin, editMode]);

  const setEditMode = useCallback((v: boolean) => { if (isAdmin) setEditModeState(v); }, [isAdmin]);
  const toggle = useCallback(() => setEditMode(!editMode), [editMode, setEditMode]);

  return (
    <EditModeContext.Provider value={{ editMode: editMode && isAdmin, canEdit: isAdmin, toggle, setEditMode }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}
