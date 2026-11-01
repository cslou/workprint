import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const DraftContext = createContext<{ active: boolean; uncertain: boolean; register(id: object, editing: boolean, uncertain?: boolean): void }>({ active: false, uncertain: false, register() {} });
/** Scope-local presentation guard only. It never saves, cancels or changes command identity. */
export function DraftGuard({ children }: { children: ReactNode }) {
  const [editors, setEditors] = useState<ReadonlyMap<object, boolean>>(new Map());
  const register = useMemo(() => (id: object, editing: boolean, uncertain = false) => setEditors(previous => {
    if (previous.has(id) === editing && (!editing || previous.get(id) === uncertain)) return previous;
    const next = new Map(previous); if (editing) next.set(id, uncertain); else next.delete(id); return next;
  }), []);
  return <DraftContext.Provider value={{ active: editors.size > 0, uncertain: [...editors.values()].some(Boolean), register }}>{children}</DraftContext.Provider>;
}
export function useDraftGuard(editing?: boolean, uncertain = false) {
  const context = useContext(DraftContext), id = useMemo(() => ({}), []);
  useEffect(() => { if (editing === undefined) return; context.register(id, editing, uncertain); return () => context.register(id, false); }, [context.register, id, editing, uncertain]);
  return context.active;
}
export function useUncertainDrafts() { return useContext(DraftContext).uncertain; }
