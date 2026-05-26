/**
 * Diagram — react-flow canvas for the Case Design. Builds nodes/edges from the
 * bundle via dagre auto-layout (overridden by manual Position_X/Y), persists
 * drag-to-nudge through updatePosition, and exposes a reset-layout action.
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  CaseDesignBundle,
  CaseDesignPosition,
} from "@/lib/case-design/types";
import { layoutDiagram, methodLabel } from "@/lib/case-design/auto-layout";
import { MoneyMapNode, type MoneyMapNodeData } from "./MoneyMapNode";

interface DiagramProps {
  bundle: CaseDesignBundle;
  updatePosition: (id: string, patch: Partial<CaseDesignPosition>) => Promise<void>;
  readOnly?: boolean;
}

const nodeTypes: NodeTypes = { moneyMap: MoneyMapNode };

export default function Diagram({ bundle, updatePosition, readOnly = false }: DiagramProps) {
  const [resetting, setResetting] = useState(false);

  const layout = useMemo(
    () => layoutDiagram(bundle.positions, bundle.edges),
    [bundle.positions, bundle.edges]
  );

  const nodes: RFNode<MoneyMapNodeData>[] = useMemo(
    () =>
      layout.nodes.map((n) => ({
        id: n.id,
        type: "moneyMap",
        position: { x: n.x, y: n.y },
        data: { position: n.position },
        draggable: !readOnly,
        selectable: true,
      })),
    [layout.nodes, readOnly]
  );

  const edges: RFEdge[] = useMemo(
    () =>
      layout.edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: methodLabel(e.edge),
        labelStyle: { fill: "#111827", fontSize: 11, fontWeight: 500 },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        style: { stroke: "#16253C", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#16253C" },
      })),
    [layout.edges]
  );

  const onNodeDragStop: OnNodeDrag<RFNode<MoneyMapNodeData>> = useCallback(
    (_event, node) => {
      if (readOnly) return;
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
          await updatePosition(p.Id, { Position_X__c: null, Position_Y__c: null });
        }
      }
    } finally {
      setResetting(false);
    }
  }, [bundle.positions, updatePosition, readOnly]);

  return (
    <div className="relative w-full h-full">
      {!readOnly && (
        <div className="absolute z-10 top-3 right-3 flex gap-2">
          <button
            type="button"
            onClick={resetLayout}
            disabled={resetting}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-zinc-300 rounded-md shadow-sm hover:border-[#C7A356] disabled:opacity-50"
          >
            {resetting ? "Resetting..." : "Reset auto-layout"}
          </button>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={20} color="#E5E7EB" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#16253C" maskColor="rgba(22,37,60,0.06)" />
      </ReactFlow>
    </div>
  );
}
