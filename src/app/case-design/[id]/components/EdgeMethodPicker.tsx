/**
 * EdgeMethodPicker — popover surfaced after the advisor drags a connection
 * between two positions. They pick a method from the 11-value picklist; on
 * confirm the parent commits the new edge via useCaseDesign.addEdge.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { EdgeMethod } from "@/lib/case-design/types";

const METHODS: { value: EdgeMethod; label: string; hint: string }[] = [
  { value: "TOA", label: "TOA", hint: "Transfer Of Assets — like-to-like move" },
  { value: "Rollover", label: "Rollover", hint: "Qualified plan → IRA rollover" },
  { value: "Replacement", label: "Replacement", hint: "Product swap" },
  { value: "LPOA", label: "LPOA", hint: "Limited Power Of Attorney" },
  { value: "LPOA Completed", label: "LPOA Completed", hint: "LPOA already executed" },
  { value: "1035", label: "1035", hint: "Tax-free annuity/life exchange" },
  { value: "Internal Roth", label: "Internal Roth", hint: "Inside-plan Roth conversion" },
  { value: "Roth Conversion", label: "Roth Conversion", hint: "Pre-tax → Roth (taxable)" },
  { value: "Continue Contributions", label: "Continue Contributions", hint: "Ongoing payroll deferral" },
  { value: "Partial Transfer", label: "Partial Transfer", hint: "Some of the balance" },
  { value: "Custom", label: "Custom…", hint: "Free-text label" },
];

interface EdgeMethodPickerProps {
  fromLabel: string;
  toLabel: string;
  position: { x: number; y: number };
  onConfirm: (method: EdgeMethod, customLabel?: string) => void;
  onCancel: () => void;
}

export default function EdgeMethodPicker({
  fromLabel,
  toLabel,
  position,
  onConfirm,
  onCancel,
}: EdgeMethodPickerProps) {
  const [method, setMethod] = useState<EdgeMethod>("TOA");
  const [customLabel, setCustomLabel] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  const handleConfirm = () => {
    if (method === "Custom" && !customLabel.trim()) return;
    onConfirm(method, method === "Custom" ? customLabel.trim() : undefined);
  };

  // Clamp position so popover doesn't overflow the viewport (best-effort).
  const top = Math.max(80, Math.min(position.y, typeof window !== "undefined" ? window.innerHeight - 360 : position.y));
  const left = Math.max(16, Math.min(position.x, typeof window !== "undefined" ? window.innerWidth - 320 : position.x));

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[320px] bg-white border border-zinc-200 rounded-lg shadow-xl"
      style={{ top, left }}
      role="dialog"
      aria-label="Choose money-movement method"
    >
      <div className="px-4 py-3 border-b border-zinc-100">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          New connection
        </div>
        <div className="text-sm text-[#16253C] mt-0.5 truncate">
          <span className="font-semibold">{fromLabel}</span>
          <span className="mx-1.5 text-zinc-400">→</span>
          <span className="font-semibold">{toLabel}</span>
        </div>
      </div>

      <div className="p-3 max-h-64 overflow-y-auto">
        <div className="grid grid-cols-1 gap-1">
          {METHODS.map((m) => {
            const active = method === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={`text-left px-3 py-2 rounded-md transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 motion-reduce:transition-none ${
                  active
                    ? "bg-[#16253C] text-white"
                    : "bg-white hover:bg-zinc-50 text-zinc-900"
                }`}
              >
                <div className="text-sm font-semibold">{m.label}</div>
                <div className={`text-[11px] ${active ? "text-white/70" : "text-zinc-500"}`}>
                  {m.hint}
                </div>
              </button>
            );
          })}
        </div>

        {method === "Custom" && (
          <div className="mt-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
              Custom label
            </label>
            <input
              type="text"
              autoFocus
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              placeholder="e.g. Required Minimum Distribution"
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-md focus:outline-none focus:border-[#C7A356] focus:ring-2 focus:ring-[#C7A356]/30"
            />
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-zinc-100 flex justify-end gap-2 bg-zinc-50 rounded-b-lg">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 min-h-[36px] text-xs font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={method === "Custom" && !customLabel.trim()}
          className="px-3 py-1.5 min-h-[36px] text-xs font-semibold bg-[#C7A356] text-[#16253C] rounded-md hover:bg-[#D9B96E] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none"
        >
          Create connection
        </button>
      </div>
    </div>
  );
}
