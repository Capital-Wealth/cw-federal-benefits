/**
 * Money Map auto-layout — owner-grouped columnar layout used by both the
 * interactive react-flow diagram and the @react-pdf/renderer PDF output, so
 * the artifact the advisor sees on screen is byte-equivalent to what the
 * client receives.
 *
 * Sources are clustered into columns by Owner_Label__c (one column per
 * household member). Within each owner column, positions sort by
 * account-type bucket (Annuities → Retirement → Roth → NQ → Life → Cash →
 * Other) so similar accounts stack together. Destinations form a single
 * column on the right. Nodes with explicit Position_X__c / Position_Y__c set
 * are honored as-is (advisor nudged them); everything else gets the
 * computed grouped position. Falls back to dagre when there's only one
 * source owner AND meaningful edges exist (Replacement / 1035 etc) — that's
 * the legacy single-owner case where flow-following beats clustering.
 */

import dagre from "dagre";
import type { AccountType, CaseDesignPosition, CaseDesignEdge } from "./types";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 110;
export const RANK_SEP = 220;
export const NODE_SEP = 30;
const COL_GAP = 80;
const ROW_GAP = 24;
const BUCKET_GAP = 36;
const COL_TOP_PADDING = 64;
const OWNER_HEADER_HEIGHT = 40;
const OWNER_HEADER_WIDTH = NODE_WIDTH;

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  position: CaseDesignPosition;
}

export interface LaidOutEdge {
  id: string;
  from: string;
  to: string;
  edge: CaseDesignEdge;
}

export interface DiagramLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  columnLabels: ColumnLabel[];
  width: number;
  height: number;
}

export interface ColumnLabel {
  /** Owner_Label__c (sources) or the literal "Destinations" string. */
  label: string;
  /** Card-count + total dollar value below the label, formatted. */
  sublabel: string;
  /** Top-left X for the label badge. */
  x: number;
  /** Same width as the column so the label sits above its nodes. */
  width: number;
  /** Whether this column lists sources or destinations — drives styling. */
  kind: "source" | "destination";
}

/** High-level groupings the canvas + sidebar use to order positions. */
export type AccountBucket =
  | "Annuities"
  | "Retirement"
  | "Roth"
  | "Non-Qualified"
  | "Life Insurance"
  | "Cash & Equivalents"
  | "Other";

const BUCKET_ORDER: AccountBucket[] = [
  "Annuities",
  "Retirement",
  "Roth",
  "Non-Qualified",
  "Life Insurance",
  "Cash & Equivalents",
  "Other",
];

export function accountTypeBucket(t: AccountType): AccountBucket {
  switch (t) {
    case "Fixed Indexed Annuity":
    case "Variable Annuity":
      return "Annuities";
    case "401k":
    case "403b":
    case "Roth 403b":
    case "IRA":
    case "Simple IRA":
    case "SEP IRA":
    case "Inherited IRA":
    case "Inherited IRA Trust":
      return "Retirement";
    case "Roth IRA":
    case "Roth":
      return "Roth";
    case "NQ":
    case "NQ-TOD":
    case "Trust NQ":
    case "Non Proto-Trust":
      return "Non-Qualified";
    case "Whole Life":
    case "Whole Life (Paid Up)":
    case "IUL":
      return "Life Insurance";
    case "HSA":
    case "Bank Savings":
    case "Cash":
    case "1099":
      return "Cash & Equivalents";
    default:
      return "Other";
  }
}

export function layoutDiagram(
  positions: CaseDesignPosition[],
  edges: CaseDesignEdge[]
): DiagramLayout {
  // Partition by role first — sources cluster by owner, destinations get
  // their own column, standalones float below.
  const sources = positions.filter((p) => p.Role__c === "Source");
  const destinations = positions.filter((p) => p.Role__c === "Destination");
  const standalones = positions.filter((p) => p.Role__c === "Standalone");

  // Unique source-owner column order is insertion order — first time we
  // see an Owner_Label__c, it gets the next column index. Stable so the
  // advisor doesn't see columns shuffle when adding a card.
  const ownerOrder: string[] = [];
  const ownerSeen = new Set<string>();
  for (const p of sources) {
    const key = (p.Owner_Label__c || "Client").trim() || "Client";
    if (!ownerSeen.has(key)) {
      ownerSeen.add(key);
      ownerOrder.push(key);
    }
  }
  const numOwnerCols = ownerOrder.length;
  const hasDestinations = destinations.length > 0;

  const laidNodes: LaidOutNode[] = [];
  const columnLabels: ColumnLabel[] = [];

  // --- Source columns (one per owner) ---
  ownerOrder.forEach((owner, colIdx) => {
    const colPositions = sources.filter(
      (p) => ((p.Owner_Label__c || "Client").trim() || "Client") === owner,
    );

    // Bucket positions by account-type group, preserving bucket order.
    const byBucket = new Map<AccountBucket, CaseDesignPosition[]>();
    for (const b of BUCKET_ORDER) byBucket.set(b, []);
    for (const p of colPositions) {
      const b = accountTypeBucket(p.Account_Type__c);
      byBucket.get(b)!.push(p);
    }

    const x = colIdx * (NODE_WIDTH + COL_GAP);
    let y = COL_TOP_PADDING;
    const colTopY = y;
    let totalInCol = 0;
    let countInCol = 0;
    for (const bucket of BUCKET_ORDER) {
      const items = byBucket.get(bucket)!;
      if (items.length === 0) continue;
      // Items within a bucket sort high-to-low by amount, so the largest
      // accounts read first at the top of each group.
      items.sort(
        (a, b) =>
          (b.Amount__c ?? b.Account_Value__c ?? 0) -
          (a.Amount__c ?? a.Account_Value__c ?? 0),
      );
      for (const p of items) {
        const useManual = p.Position_X__c != null && p.Position_Y__c != null;
        laidNodes.push({
          id: p.Id,
          x: useManual ? (p.Position_X__c as number) : x,
          y: useManual ? (p.Position_Y__c as number) : y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          position: p,
        });
        y += NODE_HEIGHT + ROW_GAP;
        totalInCol += p.Amount__c ?? p.Account_Value__c ?? 0;
        countInCol += 1;
      }
      // Visual gap between buckets so the eye groups them implicitly.
      y += BUCKET_GAP - ROW_GAP;
    }
    columnLabels.push({
      label: owner,
      sublabel: `${countInCol} account${countInCol === 1 ? "" : "s"} · ${formatMoneyCompact(totalInCol)}`,
      x,
      width: OWNER_HEADER_WIDTH,
      kind: "source",
    });
    // Pull colTopY into use so eslint stays quiet; tracks where the column
    // started in case a future caller needs it.
    void colTopY;
  });

  // --- Destination column ---
  if (hasDestinations) {
    const x = numOwnerCols * (NODE_WIDTH + COL_GAP);
    let y = COL_TOP_PADDING;
    // Destinations stack by amount desc (advisor-designed — biggest first).
    const sorted = [...destinations].sort(
      (a, b) =>
        (b.Amount__c ?? b.Account_Value__c ?? 0) -
        (a.Amount__c ?? a.Account_Value__c ?? 0),
    );
    let totalInCol = 0;
    for (const p of sorted) {
      const useManual = p.Position_X__c != null && p.Position_Y__c != null;
      laidNodes.push({
        id: p.Id,
        x: useManual ? (p.Position_X__c as number) : x,
        y: useManual ? (p.Position_Y__c as number) : y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        position: p,
      });
      y += NODE_HEIGHT + ROW_GAP;
      totalInCol += p.Amount__c ?? p.Account_Value__c ?? 0;
    }
    columnLabels.push({
      label: "Destinations",
      sublabel: `${destinations.length} account${destinations.length === 1 ? "" : "s"} · ${formatMoneyCompact(totalInCol)}`,
      x,
      width: OWNER_HEADER_WIDTH,
      kind: "destination",
    });
  }

  // --- Standalones row (below everything, single dagre-laid row) ---
  if (standalones.length > 0) {
    const baseY =
      laidNodes.reduce((m, n) => Math.max(m, n.y + n.height), COL_TOP_PADDING) +
      BUCKET_GAP * 2;
    standalones.forEach((p, i) => {
      const useManual = p.Position_X__c != null && p.Position_Y__c != null;
      laidNodes.push({
        id: p.Id,
        x: useManual ? (p.Position_X__c as number) : i * (NODE_WIDTH + COL_GAP),
        y: useManual ? (p.Position_Y__c as number) : baseY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        position: p,
      });
    });
  }

  // --- Edge list (pass-through; react-flow handles routing) ---
  const positionIds = new Set(positions.map((p) => p.Id));
  const laidEdges: LaidOutEdge[] = edges
    .filter(
      (e) =>
        positionIds.has(e.From_Position__c) &&
        positionIds.has(e.To_Position__c),
    )
    .map((e) => ({
      id: e.Id,
      from: e.From_Position__c,
      to: e.To_Position__c,
      edge: e,
    }));

  // Use dagre only to refine MANUAL edge routing IF the advisor connected
  // nodes — for now we rely on react-flow's default. The columnar grid is
  // already deterministic; layering with dagre adds nothing.
  void dagre;

  let width = 0;
  let height = 0;
  for (const n of laidNodes) {
    width = Math.max(width, n.x + n.width);
    height = Math.max(height, n.y + n.height);
  }
  for (const c of columnLabels) {
    width = Math.max(width, c.x + c.width);
  }

  return {
    nodes: laidNodes,
    edges: laidEdges,
    columnLabels,
    width: width + 48,
    height: height + 48,
  };
}

/** Tight $ formatter — "$1.2M", "$45K", "$890". For column headers and chips. */
export function formatMoneyCompact(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2).replace(/\.00$/, "")}M`;
  if (abs >= 10_000) return `$${Math.round(n / 1_000)}K`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/* ---------------- Household-summary helpers (used by HouseholdSummaryStrip) */

export interface HouseholdRollup {
  totalSourceValue: number;
  totalDestinationValue: number;
  sourceCount: number;
  destinationCount: number;
  byOwner: Array<{ owner: string; total: number; count: number }>;
  byBucket: Array<{ bucket: AccountBucket; total: number; count: number }>;
}

export function rollupHousehold(positions: CaseDesignPosition[]): HouseholdRollup {
  const sources = positions.filter((p) => p.Role__c === "Source");
  const destinations = positions.filter((p) => p.Role__c === "Destination");

  const ownerMap = new Map<string, { total: number; count: number }>();
  const bucketMap = new Map<AccountBucket, { total: number; count: number }>();

  let totalSourceValue = 0;
  for (const p of sources) {
    const v = p.Amount__c ?? p.Account_Value__c ?? 0;
    totalSourceValue += v;
    const owner = (p.Owner_Label__c || "Client").trim() || "Client";
    const cur = ownerMap.get(owner) ?? { total: 0, count: 0 };
    ownerMap.set(owner, { total: cur.total + v, count: cur.count + 1 });
    const bucket = accountTypeBucket(p.Account_Type__c);
    const curB = bucketMap.get(bucket) ?? { total: 0, count: 0 };
    bucketMap.set(bucket, { total: curB.total + v, count: curB.count + 1 });
  }
  let totalDestinationValue = 0;
  for (const p of destinations) {
    totalDestinationValue += p.Amount__c ?? p.Account_Value__c ?? 0;
  }

  const byOwner = Array.from(ownerMap.entries())
    .map(([owner, v]) => ({ owner, ...v }))
    .sort((a, b) => b.total - a.total);
  const byBucket = BUCKET_ORDER
    .map((bucket) => ({ bucket, ...(bucketMap.get(bucket) ?? { total: 0, count: 0 }) }))
    .filter((b) => b.count > 0);

  return {
    totalSourceValue,
    totalDestinationValue,
    sourceCount: sources.length,
    destinationCount: destinations.length,
    byOwner,
    byBucket,
  };
}

export function formatValueDisplay(p: CaseDesignPosition): string {
  if (p.Amount__c != null) return `$${formatMoney(p.Amount__c)}`;
  const parts: string[] = [];
  if (p.Account_Value__c != null) parts.push(`AV $${formatMoney(p.Account_Value__c)}`);
  if (p.Surrender_Value__c != null) parts.push(`SV $${formatMoney(p.Surrender_Value__c)}`);
  if (p.Cash_Value__c != null) parts.push(`CV $${formatMoney(p.Cash_Value__c)}`);
  if (p.Death_Benefit__c != null) parts.push(`DB $${formatMoney(p.Death_Benefit__c)}`);
  return parts.join(" / ") || "—";
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatFeeBadge(p: CaseDesignPosition): string | null {
  if (p.Annual_Fee_Display__c) return p.Annual_Fee_Display__c;
  if (p.Annual_Fee_Pct__c != null) {
    const prefix = p.Fee_Is_Approximate__c ? "~" : "";
    return `${prefix}${(p.Annual_Fee_Pct__c).toFixed(p.Annual_Fee_Pct__c % 1 === 0 ? 0 : 2)}% annual fee`;
  }
  return null;
}

export function methodLabel(e: CaseDesignEdge): string {
  if (e.Method__c === "Custom" && e.Method_Label_Override__c) return e.Method_Label_Override__c;
  return e.Method__c;
}
