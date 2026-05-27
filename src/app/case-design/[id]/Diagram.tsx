/**
 * Diagram — react-flow canvas. Builds nodes/edges from the bundle via dagre
 * auto-layout (overridden by manual Position_X/Y). Drag-to-nudge persists via
 * updatePosition. Dragging from a source handle to a destination opens the
 * EdgeMethodPicker so the advisor commits a real Method__c with the new edge.
 */
"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeTypes,
  type OnNodeDrag,
  type OnConnect,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  CaseDesignBundle,
  CaseDesignEdge,
  CaseDesignPosition,
  EdgeMethod,
} from "@/lib/case-design/types";
import {
  layoutDiagram,
  methodLabel,
  type ColumnLabel,
} from "@/lib/case-design/auto-layout";
import { MoneyMapNode, type MoneyMapNodeData } from "./MoneyMapNode";
import EmptyState from "./components/EmptyState";
import EdgeMethodPicker from "./components/EdgeMethodPicker";

interface DiagramProps {
  bundle: CaseDesignBundle;
  householdLabel: string;
  selectedPositionId: string | null;
  intakeAssetCount: number;
  readOnly: boolean;
  autoFilling?: boolean;
  onSelectNode: (id: string | null) => void;
  onAddSource: () => void;
  onLoadIntake: () => void;
  updatePosition: (
    id: string,
    patch: Partial<CaseDesignPosition>
  ) => Promise<void>;
  addEdge: (data: Partial<CaseDesignEdge>) => Promise<string>;
}

/**
 * Column-label node — non-interactive header that sits above each owner
 * column / the destinations column. Renders inside the react-flow viewport so
 * it pans and zooms with the canvas — no overlay sync needed.
 */
type ColumnLabelData = { label: string; sublabel: string; kind: "source" | "destination" };
function ColumnLabelNode({ data }: { data: ColumnLabelData }) {
  const isDest = data.kind === "destination";
  return (
    <div
      className={`pointer-events-none select-none px-3 py-1.5 rounded-full border text-center ${
        isDest
          ? "bg-[#C7A356]/15 border-[#C7A356]/50 text-[#16253C]"
          : "bg-[#16253C] border-[#16253C] text-white"
      }`}
      style={{ width: 200 }}
    >
      <div className={`text-xs font-bold leading-tight truncate ${isDest ? "" : ""}`}>
        {data.label}
      </div>
      <div className={`text-[10px] leading-tight truncate ${isDest ? "text-[#16253C]/70" : "text-[#C7A356]"}`}>
        {data.sublabel}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { moneyMap: MoneyMapNode, columnLabel: ColumnLabelNode };

interface PendingConnection {
  fromId: string;
  toId: string;
  screenX: number;
  screenY: number;
}

export default function Diagram({
  bundle,
  householdLabel,
  selectedPositionId,
  intakeAssetCount,
  readOnly,
  autoFilling = false,
  onSelectNode,
  onAddSource,
  onLoadIntake,
  updatePosition,
  addEdge,
}: DiagramProps) {
  const [resetting, setResetting] = useState(false);
  const [pending, setPending] = useState<PendingConnection | null>(null);

  const layout = useMemo(
    () => layoutDiagram(bundle.positions, bundle.edges),
    [bundle.positions, bundle.edges]
  );

  // Sources with no outgoing edges = "Keep" — advertised on the node via a
  // small badge. Computed once per render off the bundle edges.
  const sourceIdsWithOutgoing = useMemo(() => {
    const s = new Set<string>();
    for (const e of bundle.edges) {
      if (e.From_Position__c) s.add(e.From_Position__c);
    }
    return s;
  }, [bundle.edges]);

  const nodes: RFNode[] = useMemo(() => {
    const accountNodes: RFNode<MoneyMapNodeData>[] = layout.nodes.map((n) => {
      const isKeep =
        n.position.Role__c === "Source" && !sourceIdsWithOutgoing.has(n.id);
      return {
        id: n.id,
        type: "moneyMap",
        position: { x: n.x, y: n.y },
        data: { position: n.position, keepBadge: isKeep },
        draggable: !readOnly,
        selectable: true,
        selected: n.id === selectedPositionId,
      };
    });
    // Column-header labels sit just above the top of each column. Indexed by
    // the column's source/destination position so they pan with the canvas.
    const headerNodes: RFNode[] = layout.columnLabels.map((c: ColumnLabel) => ({
      id: `column-label-${c.kind}-${c.label}`,
      type: "columnLabel",
      position: { x: c.x, y: 8 },
      data: { label: c.label, sublabel: c.sublabel, kind: c.kind },
      draggable: false,
      selectable: false,
      focusable: false,
    }));
    return [...headerNodes, ...accountNodes] as RFNode[];
  }, [layout.nodes, layout.columnLabels, readOnly, selectedPositionId]);

  const edges: RFEdge[] = useMemo(
    () =>
      layout.edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: methodLabel(e.edge),
        labelStyle: { fill: "#16253C", fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.95 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        style: { stroke: "#475569", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#475569" },
      })),
    [layout.edges]
  );

  const onNodeDragStop: OnNodeDrag<RFNode> = useCallback(
    (_event, node) => {
      if (readOnly) return;
      // Column-label header nodes are draggable:false so they can't reach
      // this callback in practice, but guard anyway.
      if (node.type !== "moneyMap") return;
      void updatePosition(node.id, {
        Position_X__c: node.position.x,
        Position_Y__c: node.position.y,
      });
    },
    [updatePosition, readOnly]
  );

  const resetLayout = useCallback(async () => {
    if (readOnly) return;
    if (!window.confirm("Reset all manual node positions to auto-layout?")) return;
    setResetting(true);
    try {
      for (const p of bundle.positions) {
        if (p.Position_X__c != null || p.Position_Y__c != null) {
          await updatePosition(p.Id, {
            Position_X__c: null,
            Position_Y__c: null,
          });
        }
      }
    } finally {
      setResetting(false);
    }
  }, [bundle.positions, updatePosition, readOnly]);

  const onConnect: OnConnect = useCallback(
    (conn: Connection) => {
      if (readOnly || !conn.source || !conn.target) return;
      // Stash the connection; show the method picker near the cursor.
      const cursor =
        typeof window !== "undefined"
          ? (window as unknown as { _cwLastMouse?: { x: number; y: number } })
              ._cwLastMouse || { x: window.innerWidth / 2, y: window.innerHeight / 2 }
          : { x: 200, y: 200 };
      setPending({
        fromId: conn.source,
        toId: conn.target,
        screenX: cursor.x,
        screenY: cursor.y,
      });
    },
    [readOnly]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
      // Column-label headers are presentational only — ignore clicks on them
      // so the EditPanel doesn't try to load a position that doesn't exist.
      if (node.type !== "moneyMap") return;
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  const handleConfirmEdge = useCallback(
    async (method: EdgeMethod, customLabel?: string) => {
      if (!pending) return;
      const data: Partial<CaseDesignEdge> = {
        From_Position__c: pending.fromId,
        To_Position__c: pending.toId,
        Method__c: method,
        Status__c: "Planned",
      };
      if (method === "Custom" && customLabel) {
        data.Method_Label_Override__c = customLabel;
      }
      setPending(null);
      await addEdge(data);
    },
    [pending, addEdge]
  );

  const fromLabel = pending
    ? bundle.positions.find((p) => p.Id === pending.fromId)?.Owner_Label__c || "?"
    : "";
  const toLabel = pending
    ? bundle.positions.find((p) => p.Id === pending.toId)?.Owner_Label__c || "?"
    : "";

  const isEmpty = bundle.positions.length === 0;

  return (
    <div
      className="relative w-full h-full"
      onMouseMoveCapture={(e) => {
        if (typeof window !== "undefined") {
          (window as unknown as { _cwLastMouse?: { x: number; y: number } })._cwLastMouse = {
            x: e.clientX,
            y: e.clientY,
          };
        }
      }}
    >
      {!readOnly && !isEmpty && (
        <div className="absolute z-10 top-3 right-3 flex gap-2">
          <button
            type="button"
            onClick={resetLayout}
            disabled={resetting}
            className="px-3 py-1.5 min-h-[36px] text-xs font-medium bg-white border border-zinc-300 rounded-md shadow-sm hover:border-[#C7A356] hover:text-[#16253C] cursor-pointer disabled:opacity-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none"
          >
            {resetting ? "Resetting…" : "Reset layout"}
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        connectionRadius={40}
      >
        <Background gap={24} size={1} color="#E4E4E7" />
        <Controls showInteractive={false} />
        {!isEmpty && (
          <MiniMap
            pannable
            zoomable
            nodeColor="#16253C"
            maskColor="rgba(22,37,60,0.06)"
            className="!bg-white"
          />
        )}
      </ReactFlow>

      {isEmpty && (
        <EmptyState
          householdLabel={householdLabel}
          intakeCount={intakeAssetCount}
          autoFilling={autoFilling}
          onAddSource={onAddSource}
          onImportIntake={intakeAssetCount > 0 ? onLoadIntake : undefined}
        />
      )}

      {/* Bottom helper bar */}
      {!isEmpty && !readOnly && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-white/85 backdrop-blur border-t border-zinc-200 flex items-center px-4 text-[11px] text-zinc-600 pointer-events-none">
          <span>
            Click a box to edit
            <span className="mx-2 text-zinc-300">·</span>
            Drag from a source handle to a destination to connect them
          </span>
        </div>
      )}

      {pending && (
        <EdgeMethodPicker
          fromLabel={fromLabel}
          toLabel={toLabel}
          position={{ x: pending.screenX, y: pending.screenY }}
          onConfirm={handleConfirmEdge}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
