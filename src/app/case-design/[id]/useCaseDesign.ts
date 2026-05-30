/**
 * useCaseDesign — client state hook for the Case Design builder.
 * Owns the bundle, dispatches optimistic mutations, then reconciles with the
 * server via GET /api/case-design/[id]. Surfaces save status + last-saved time.
 */
"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  CaseDesignBundle,
  CaseDesignParent,
  CaseDesignTab,
  CaseDesignSection,
  CaseDesignPosition,
  CaseDesignEdge,
  CaseDesignAnnotation,
} from "@/lib/case-design/types";

type Action =
  | { type: "set-bundle"; bundle: CaseDesignBundle }
  | { type: "patch-parent"; patch: Partial<CaseDesignParent> }
  | { type: "upsert-tab"; row: CaseDesignTab }
  | { type: "patch-tab"; id: string; patch: Partial<CaseDesignTab> }
  | { type: "remove-tab"; id: string }
  | { type: "upsert-position"; row: CaseDesignPosition }
  | { type: "patch-position"; id: string; patch: Partial<CaseDesignPosition> }
  | { type: "remove-position"; id: string }
  | { type: "upsert-section"; row: CaseDesignSection }
  | { type: "patch-section"; id: string; patch: Partial<CaseDesignSection> }
  | { type: "remove-section"; id: string }
  | { type: "upsert-edge"; row: CaseDesignEdge }
  | { type: "patch-edge"; id: string; patch: Partial<CaseDesignEdge> }
  | { type: "remove-edge"; id: string }
  | { type: "upsert-annotation"; row: CaseDesignAnnotation }
  | { type: "patch-annotation"; id: string; patch: Partial<CaseDesignAnnotation> }
  | { type: "remove-annotation"; id: string };

function reducer(state: CaseDesignBundle, action: Action): CaseDesignBundle {
  switch (action.type) {
    case "set-bundle":
      return action.bundle;
    case "patch-parent":
      return { ...state, parent: { ...state.parent, ...action.patch } };
    case "upsert-tab": {
      const exists = state.tabs.some((t) => t.Id === action.row.Id);
      const tabs = exists
        ? state.tabs.map((t) => (t.Id === action.row.Id ? action.row : t))
        : [...state.tabs, action.row];
      return { ...state, tabs };
    }
    case "patch-tab":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.Id === action.id ? { ...t, ...action.patch } : t
        ),
      };
    case "remove-tab":
      return { ...state, tabs: state.tabs.filter((t) => t.Id !== action.id) };
    case "upsert-position": {
      const exists = state.positions.some((p) => p.Id === action.row.Id);
      const positions = exists
        ? state.positions.map((p) => (p.Id === action.row.Id ? action.row : p))
        : [...state.positions, action.row];
      return { ...state, positions };
    }
    case "patch-position":
      return {
        ...state,
        positions: state.positions.map((p) =>
          p.Id === action.id ? { ...p, ...action.patch } : p
        ),
      };
    case "remove-position":
      return { ...state, positions: state.positions.filter((p) => p.Id !== action.id) };
    case "upsert-section": {
      const exists = state.sections.some((s) => s.Id === action.row.Id);
      const sections = exists
        ? state.sections.map((s) => (s.Id === action.row.Id ? action.row : s))
        : [...state.sections, action.row];
      return { ...state, sections };
    }
    case "patch-section":
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.Id === action.id ? { ...s, ...action.patch } : s
        ),
      };
    case "remove-section":
      return { ...state, sections: state.sections.filter((s) => s.Id !== action.id) };
    case "upsert-edge": {
      const exists = state.edges.some((e) => e.Id === action.row.Id);
      const edges = exists
        ? state.edges.map((e) => (e.Id === action.row.Id ? action.row : e))
        : [...state.edges, action.row];
      return { ...state, edges };
    }
    case "patch-edge":
      return {
        ...state,
        edges: state.edges.map((e) =>
          e.Id === action.id ? { ...e, ...action.patch } : e
        ),
      };
    case "remove-edge":
      return { ...state, edges: state.edges.filter((e) => e.Id !== action.id) };
    case "upsert-annotation": {
      const exists = state.annotations.some((a) => a.Id === action.row.Id);
      const annotations = exists
        ? state.annotations.map((a) => (a.Id === action.row.Id ? action.row : a))
        : [...state.annotations, action.row];
      return { ...state, annotations };
    }
    case "patch-annotation":
      return {
        ...state,
        annotations: state.annotations.map((a) =>
          a.Id === action.id ? { ...a, ...action.patch } : a
        ),
      };
    case "remove-annotation":
      return { ...state, annotations: state.annotations.filter((a) => a.Id !== action.id) };
    default:
      return state;
  }
}

/**
 * The Page_Number every legacy / untabbed record resolves to: the lowest tab
 * Page_Number, or 1 when there are no tabs. Records with a null Page_Number
 * (legacy single-page Case Designs) always land on the first tab.
 */
export function firstPageNumber(tabs: CaseDesignTab[]): number {
  if (tabs.length === 0) return 1;
  return tabs.reduce((min, t) => Math.min(min, t.Page_Number__c ?? 1), Infinity) || 1;
}

/** Resolve which page a record belongs to. Null Page_Number → first tab. */
export function resolvePage(pageNumber: number | null, tabs: CaseDesignTab[]): number {
  return pageNumber ?? firstPageNumber(tabs);
}

/**
 * Default active tab: the tab with the LOWEST Sort_Order (fallback
 * Page_Number). Returns the resolved Page_Number, or the implicit first page
 * (firstPageNumber) when there are no tabs.
 */
export function defaultActivePage(tabs: CaseDesignTab[]): number {
  if (tabs.length === 0) return firstPageNumber(tabs);
  const sorted = [...tabs].sort((a, b) => {
    const sa = a.Sort_Order__c ?? a.Page_Number__c ?? 0;
    const sb = b.Sort_Order__c ?? b.Page_Number__c ?? 0;
    return sa - sb;
  });
  return sorted[0].Page_Number__c ?? 1;
}

interface UseCaseDesignReturn {
  bundle: CaseDesignBundle;
  saving: boolean;
  lastSavedAt: Date | null;
  activePage: number;
  setActivePage(page: number): void;
  refetch(): Promise<void>;
  updateParent(patch: Partial<CaseDesignParent>): Promise<void>;
  addTab(data: Partial<CaseDesignTab>): Promise<string>;
  updateTab(id: string, patch: Partial<CaseDesignTab>): Promise<void>;
  deleteTab(id: string): Promise<void>;
  addPosition(data: Partial<CaseDesignPosition>): Promise<string>;
  updatePosition(id: string, patch: Partial<CaseDesignPosition>): Promise<void>;
  deletePosition(id: string): Promise<void>;
  addSection(data: Partial<CaseDesignSection>): Promise<string>;
  updateSection(id: string, patch: Partial<CaseDesignSection>): Promise<void>;
  deleteSection(id: string): Promise<void>;
  addEdge(data: Partial<CaseDesignEdge>): Promise<string>;
  updateEdge(id: string, patch: Partial<CaseDesignEdge>): Promise<void>;
  deleteEdge(id: string): Promise<void>;
  addAnnotation(data: Partial<CaseDesignAnnotation>): Promise<string>;
  updateAnnotation(id: string, patch: Partial<CaseDesignAnnotation>): Promise<void>;
  deleteAnnotation(id: string): Promise<void>;
}

export function useCaseDesign(initial: CaseDesignBundle): UseCaseDesignReturn {
  const [bundle, dispatch] = useReducer(reducer, initial);
  const [inflight, setInflight] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const caseDesignId = initial.parent.Id;

  // The user's chosen active tab (page). Defaults to the lowest-Sort_Order
  // tab, or the implicit first page when no tabs exist.
  const [activePageIntent, setActivePageState] = useState<number>(() =>
    defaultActivePage(initial.tabs)
  );
  const setActivePage = useCallback((page: number) => setActivePageState(page), []);

  // Effective active page: the user's intent, CLAMPED to a live tab. If the
  // active tab was deleted (server reconcile drops it), fall back to the
  // default tab — derived, so no setState-in-effect cascade. When no tabs
  // exist the implicit first page is always valid.
  const activePage = useMemo(() => {
    if (bundle.tabs.length === 0) return activePageIntent;
    const stillExists = bundle.tabs.some(
      (t) => (t.Page_Number__c ?? 1) === activePageIntent
    );
    return stillExists ? activePageIntent : defaultActivePage(bundle.tabs);
  }, [bundle.tabs, activePageIntent]);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/case-design/${caseDesignId}`, { cache: "no-store" });
      if (!res.ok) return;
      const fresh = (await res.json()) as CaseDesignBundle;
      dispatch({ type: "set-bundle", bundle: fresh });
    } catch {
      // network errors are surfaced by the mutating call; refetch is best-effort
    }
  }, [caseDesignId]);

  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      refetchTimer.current = null;
      void refetch();
    }, 400);
  }, [refetch]);

  useEffect(() => {
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, []);

  const runRequest = useCallback(
    async <T = unknown>(input: RequestInfo, init?: RequestInit): Promise<T> => {
      setInflight((n) => n + 1);
      try {
        const res = await fetch(input, init);
        const text = await res.text();
        const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        if (!res.ok) {
          const msg =
            (data && typeof data.error === "string" && data.error) ||
            `Request failed (${res.status})`;
          throw new Error(msg);
        }
        setLastSavedAt(new Date());
        return data as T;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Request failed";
        if (typeof window !== "undefined") {
          // Surface to the builder via a custom event; the builder shows a
          // non-blocking toast. Fallback to window.alert if no listener is
          // attached (preserves prior behavior for any external consumers).
          const ev = new CustomEvent("cw-case-design-error", { detail: msg, cancelable: true });
          const handled = !window.dispatchEvent(ev);
          if (!handled) window.alert(msg);
        }
        throw err;
      } finally {
        setInflight((n) => Math.max(0, n - 1));
      }
    },
    []
  );

  // ---- parent ----
  const updateParent = useCallback(
    async (patch: Partial<CaseDesignParent>) => {
      dispatch({ type: "patch-parent", patch });
      await runRequest(`/api/case-design/${caseDesignId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  // ---- tabs ----
  const addTab = useCallback(
    async (data: Partial<CaseDesignTab>): Promise<string> => {
      const { id } = await runRequest<{ id: string }>(
        `/api/case-design/${caseDesignId}/tabs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      const optimistic: CaseDesignTab = {
        Id: id,
        Name: data.Name ?? "",
        Case_Design__c: caseDesignId,
        Label__c: data.Label__c ?? "New Tab",
        Tab_Date__c: data.Tab_Date__c ?? null,
        Page_Number__c: data.Page_Number__c ?? 1,
        Sort_Order__c: data.Sort_Order__c ?? null,
      };
      dispatch({ type: "upsert-tab", row: optimistic });
      scheduleRefetch();
      return id;
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  const updateTab = useCallback(
    async (id: string, patch: Partial<CaseDesignTab>) => {
      dispatch({ type: "patch-tab", id, patch });
      await runRequest(`/api/case-design/${caseDesignId}/tabs`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  const deleteTab = useCallback(
    async (id: string) => {
      dispatch({ type: "remove-tab", id });
      await runRequest(`/api/case-design/${caseDesignId}/tabs`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  // ---- positions ----
  const addPosition = useCallback(
    async (data: Partial<CaseDesignPosition>): Promise<string> => {
      // Stamp the active tab's page onto new positions so they belong to the
      // tab the advisor is currently looking at. Caller-supplied values win.
      const payload: Partial<CaseDesignPosition> = {
        Page_Number__c: activePage,
        ...data,
      };
      const { id } = await runRequest<{ id: string }>(
        `/api/case-design/${caseDesignId}/positions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const optimistic: CaseDesignPosition = {
        Id: id,
        Name: data.Name ?? "",
        Case_Design__c: caseDesignId,
        Section__c: data.Section__c ?? null,
        Role__c: data.Role__c ?? "Source",
        Stage__c: data.Stage__c ?? null,
        Source_Asset__c: data.Source_Asset__c ?? null,
        Source_Vault_Document_Id__c: data.Source_Vault_Document_Id__c ?? null,
        Source_Vault_Document_Name__c: data.Source_Vault_Document_Name__c ?? null,
        Owner_Label__c: data.Owner_Label__c ?? "",
        Account_Type__c: data.Account_Type__c ?? "Other",
        Account_Type_Other__c: data.Account_Type_Other__c ?? null,
        Custodian__c: data.Custodian__c ?? "",
        Product_Detail__c: data.Product_Detail__c ?? null,
        Account_Number_Last4__c: data.Account_Number_Last4__c ?? null,
        Inception_Date_Text__c: data.Inception_Date_Text__c ?? null,
        Amount__c: data.Amount__c ?? null,
        Account_Value__c: data.Account_Value__c ?? null,
        Surrender_Value__c: data.Surrender_Value__c ?? null,
        Cash_Value__c: data.Cash_Value__c ?? null,
        Death_Benefit__c: data.Death_Benefit__c ?? null,
        Annual_Fee_Pct__c: data.Annual_Fee_Pct__c ?? null,
        Annual_Fee_Display__c: data.Annual_Fee_Display__c ?? null,
        Fee_Is_Approximate__c: data.Fee_Is_Approximate__c ?? false,
        Contribution_Note__c: data.Contribution_Note__c ?? null,
        Position_X__c: data.Position_X__c ?? null,
        Position_Y__c: data.Position_Y__c ?? null,
        Replaces_Position__c: data.Replaces_Position__c ?? null,
        Page_Number__c: payload.Page_Number__c ?? null,
      };
      dispatch({ type: "upsert-position", row: optimistic });
      scheduleRefetch();
      return id;
    },
    [caseDesignId, runRequest, scheduleRefetch, activePage]
  );

  const updatePosition = useCallback(
    async (id: string, patch: Partial<CaseDesignPosition>) => {
      dispatch({ type: "patch-position", id, patch });
      await runRequest(`/api/case-design/${caseDesignId}/positions`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  const deletePosition = useCallback(
    async (id: string) => {
      dispatch({ type: "remove-position", id });
      await runRequest(`/api/case-design/${caseDesignId}/positions`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  // ---- sections ----
  const addSection = useCallback(
    async (data: Partial<CaseDesignSection>): Promise<string> => {
      const { id } = await runRequest<{ id: string }>(
        `/api/case-design/${caseDesignId}/sections`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      const optimistic: CaseDesignSection = {
        Id: id,
        Name: data.Name ?? "",
        Case_Design__c: caseDesignId,
        Label__c: data.Label__c ?? "",
        Section_Type__c: data.Section_Type__c ?? "Custom",
        Page_Number__c: data.Page_Number__c ?? 1,
        Sort_Order__c: data.Sort_Order__c ?? null,
        Style__c: data.Style__c ?? "Standard",
      };
      dispatch({ type: "upsert-section", row: optimistic });
      scheduleRefetch();
      return id;
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  const updateSection = useCallback(
    async (id: string, patch: Partial<CaseDesignSection>) => {
      dispatch({ type: "patch-section", id, patch });
      await runRequest(`/api/case-design/${caseDesignId}/sections`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  const deleteSection = useCallback(
    async (id: string) => {
      dispatch({ type: "remove-section", id });
      await runRequest(`/api/case-design/${caseDesignId}/sections`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  // ---- edges ----
  const addEdge = useCallback(
    async (data: Partial<CaseDesignEdge>): Promise<string> => {
      // Stamp the active tab's page onto new edges. Caller-supplied wins.
      const payload: Partial<CaseDesignEdge> = {
        Page_Number__c: activePage,
        ...data,
      };
      const { id } = await runRequest<{ id: string }>(
        `/api/case-design/${caseDesignId}/edges`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const optimistic: CaseDesignEdge = {
        Id: id,
        Name: data.Name ?? "",
        Case_Design__c: caseDesignId,
        From_Position__c: data.From_Position__c ?? "",
        To_Position__c: data.To_Position__c ?? "",
        Method__c: data.Method__c ?? "Custom",
        Method_Label_Override__c: data.Method_Label_Override__c ?? null,
        Partial_Amount__c: data.Partial_Amount__c ?? null,
        Gross_Amount__c: data.Gross_Amount__c ?? null,
        Federal_Tax__c: data.Federal_Tax__c ?? null,
        State_Tax__c: data.State_Tax__c ?? null,
        Tax_Payment_Source__c: data.Tax_Payment_Source__c ?? null,
        Timing_Note__c: data.Timing_Note__c ?? null,
        Stage__c: data.Stage__c ?? null,
        Status__c: data.Status__c ?? "Planned",
        Page_Number__c: payload.Page_Number__c ?? null,
      };
      dispatch({ type: "upsert-edge", row: optimistic });
      scheduleRefetch();
      return id;
    },
    [caseDesignId, runRequest, scheduleRefetch, activePage]
  );

  const updateEdge = useCallback(
    async (id: string, patch: Partial<CaseDesignEdge>) => {
      dispatch({ type: "patch-edge", id, patch });
      await runRequest(`/api/case-design/${caseDesignId}/edges`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  const deleteEdge = useCallback(
    async (id: string) => {
      dispatch({ type: "remove-edge", id });
      await runRequest(`/api/case-design/${caseDesignId}/edges`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  // ---- annotations ----
  const addAnnotation = useCallback(
    async (data: Partial<CaseDesignAnnotation>): Promise<string> => {
      const { id } = await runRequest<{ id: string }>(
        `/api/case-design/${caseDesignId}/annotations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      const optimistic: CaseDesignAnnotation = {
        Id: id,
        Name: data.Name ?? "",
        Case_Design__c: caseDesignId,
        Text__c: data.Text__c ?? "",
        Style__c: data.Style__c ?? "Standard",
        Section__c: data.Section__c ?? null,
        Anchor_Position__c: data.Anchor_Position__c ?? null,
        Anchor_Edge__c: data.Anchor_Edge__c ?? null,
        Page_Number__c: data.Page_Number__c ?? 1,
        Sort_Order__c: data.Sort_Order__c ?? null,
      };
      dispatch({ type: "upsert-annotation", row: optimistic });
      scheduleRefetch();
      return id;
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  const updateAnnotation = useCallback(
    async (id: string, patch: Partial<CaseDesignAnnotation>) => {
      dispatch({ type: "patch-annotation", id, patch });
      await runRequest(`/api/case-design/${caseDesignId}/annotations`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  const deleteAnnotation = useCallback(
    async (id: string) => {
      dispatch({ type: "remove-annotation", id });
      await runRequest(`/api/case-design/${caseDesignId}/annotations`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      scheduleRefetch();
    },
    [caseDesignId, runRequest, scheduleRefetch]
  );

  return {
    bundle,
    saving: inflight > 0,
    lastSavedAt,
    activePage,
    setActivePage,
    refetch,
    updateParent,
    addTab,
    updateTab,
    deleteTab,
    addPosition,
    updatePosition,
    deletePosition,
    addSection,
    updateSection,
    deleteSection,
    addEdge,
    updateEdge,
    deleteEdge,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
  };
}

/** Debounce helper — returns a stable callback that fires after `ms` of no calls. */
export function useDebounce<T extends (...args: never[]) => void>(fn: T, ms = 300): T {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  useEffect(() => {
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);
  return useCallback((...args: Parameters<T>) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => fnRef.current(...args), ms);
  }, [ms]) as T;
}
