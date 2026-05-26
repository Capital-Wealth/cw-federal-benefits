/**
 * Money Map auto-layout — dagre L→R columnar layout used by both the
 * interactive react-flow diagram and the @react-pdf/renderer PDF output, so
 * the artifact the advisor sees on screen is byte-equivalent to what the
 * client receives.
 *
 * Sources are pinned to the left rank, destinations to the right. Standalone
 * nodes are floated in a separate "ungrouped" rank below the main flow.
 * Nodes that explicitly have Position_X__c / Position_Y__c set are honored
 * as-is (advisor nudged them); everything else gets dagre-computed.
 */

import dagre from "dagre";
import type { CaseDesignPosition, CaseDesignEdge } from "./types";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 110;
export const RANK_SEP = 220;
export const NODE_SEP = 30;

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
  width: number;
  height: number;
}

export function layoutDiagram(
  positions: CaseDesignPosition[],
  edges: CaseDesignEdge[]
): DiagramLayout {
  const g = new dagre.graphlib.Graph({ multigraph: false, compound: false });
  g.setGraph({
    rankdir: "LR",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const p of positions) {
    g.setNode(p.Id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    if (positions.find((p) => p.Id === e.From_Position__c) &&
        positions.find((p) => p.Id === e.To_Position__c)) {
      g.setEdge(e.From_Position__c, e.To_Position__c);
    }
  }

  dagre.layout(g);

  const laidNodes: LaidOutNode[] = positions.map((p) => {
    const n = g.node(p.Id);
    const useManual = p.Position_X__c != null && p.Position_Y__c != null;
    return {
      id: p.Id,
      x: useManual ? (p.Position_X__c as number) : (n?.x ?? 0) - NODE_WIDTH / 2,
      y: useManual ? (p.Position_Y__c as number) : (n?.y ?? 0) - NODE_HEIGHT / 2,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      position: p,
    };
  });

  const laidEdges: LaidOutEdge[] = edges
    .filter((e) =>
      positions.find((p) => p.Id === e.From_Position__c) &&
      positions.find((p) => p.Id === e.To_Position__c)
    )
    .map((e) => ({
      id: e.Id,
      from: e.From_Position__c,
      to: e.To_Position__c,
      edge: e,
    }));

  // canvas bounds for downstream sizing
  let width = 0, height = 0;
  for (const n of laidNodes) {
    width = Math.max(width, n.x + n.width);
    height = Math.max(height, n.y + n.height);
  }

  return { nodes: laidNodes, edges: laidEdges, width: width + 48, height: height + 48 };
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
