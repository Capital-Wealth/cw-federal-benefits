/**
 * AdvancedDrawer — slide-in from the left, exposes the rarely-used parts of
 * a Case Design (internal Notes, Sections, Annotations). Hidden behind a
 * floating ⋮ button so the main canvas stays uncluttered for the 90% case.
 */
"use client";

import { useState } from "react";
import type {
  AnnotationStyle,
  CaseDesignAnnotation,
  CaseDesignBundle,
  CaseDesignSection,
  SectionType,
} from "@/lib/case-design/types";

const SECTION_TYPES: SectionType[] = [
  "Consolidation",
  "Continue Contributions",
  "Tax Planning",
  "Self Directed",
  "Stage",
  "Custom",
];

const ANNOTATION_STYLES: AnnotationStyle[] = [
  "Standard",
  "High Priority",
  "Disclaimer",
  "Note Block",
];

interface AdvancedDrawerHook {
  updateParent: (
    patch: Partial<CaseDesignBundle["parent"]>
  ) => Promise<void>;
  addSection: (data: Partial<CaseDesignSection>) => Promise<string>;
  updateSection: (id: string, patch: Partial<CaseDesignSection>) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  addAnnotation: (data: Partial<CaseDesignAnnotation>) => Promise<string>;
  updateAnnotation: (
    id: string,
    patch: Partial<CaseDesignAnnotation>
  ) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
}

interface AdvancedDrawerProps {
  open: boolean;
  bundle: CaseDesignBundle;
  hook: AdvancedDrawerHook;
  readOnly: boolean;
  onClose: () => void;
}

export default function AdvancedDrawer({
  open,
  bundle,
  hook,
  readOnly,
  onClose,
}: AdvancedDrawerProps) {
  const [section, setSection] = useState<"notes" | "sections" | "annotations">("notes");

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-30"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-80 bg-white border-r border-zinc-200 shadow-xl z-40 flex flex-col"
        role="dialog"
        aria-label="Advanced settings"
      >
        <header className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <h2 className="text-sm font-bold text-[#16253C]">Advanced</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close advanced drawer"
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 motion-reduce:transition-none"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Section tabs */}
        <div className="flex border-b border-zinc-200 bg-white">
          {(["notes", "sections", "annotations"] as const).map((s) => {
            const labels: Record<typeof s, string> = {
              notes: "Notes",
              sections: `Sections (${bundle.sections.length})`,
              annotations: `Annotations (${bundle.annotations.length})`,
            };
            const active = section === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`flex-1 px-2 py-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-colors duration-200 motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-inset ${
                  active
                    ? "text-[#16253C] border-b-2 border-[#C7A356]"
                    : "text-zinc-500 hover:text-zinc-800 border-b-2 border-transparent"
                }`}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {section === "notes" && (
            <NotesSection
              value={bundle.parent.Notes__c}
              readOnly={readOnly}
              onCommit={(v) => hook.updateParent({ Notes__c: v })}
            />
          )}
          {section === "sections" && (
            <SectionsList bundle={bundle} hook={hook} readOnly={readOnly} />
          )}
          {section === "annotations" && (
            <AnnotationsList bundle={bundle} hook={hook} readOnly={readOnly} />
          )}
        </div>
      </aside>
    </>
  );
}

/* ---------------- Floating toggle button ---------------- */

export function AdvancedDrawerButton({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close advanced drawer" : "Open advanced drawer"}
      title="Notes, Sections, Annotations"
      className={`fixed bottom-6 left-6 w-12 h-12 rounded-full shadow-lg z-20 inline-flex items-center justify-center cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none ${
        isOpen
          ? "bg-[#C7A356] text-[#16253C] hover:bg-[#D9B96E]"
          : "bg-[#16253C] text-white hover:bg-[#1E3456]"
      }`}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    </button>
  );
}

/* ---------------- Notes ---------------- */

function NotesSection({
  value,
  readOnly,
  onCommit,
}: {
  value: string | null;
  readOnly: boolean;
  onCommit: (v: string | null) => void;
}) {
  return (
    <div>
      <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">
        Internal notes for the advisor team. Not rendered on the client-facing PDF.
      </p>
      <textarea
        disabled={readOnly}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== (value ?? "")) onCommit(v || null);
        }}
        rows={14}
        placeholder="Strategy summary, open questions, next steps for the advisor team…"
        className="w-full px-3 py-2 text-xs font-mono leading-relaxed border border-zinc-300 rounded-md focus:outline-none focus:border-[#C7A356] focus:ring-2 focus:ring-[#C7A356]/30 disabled:bg-zinc-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/* ---------------- Sections ---------------- */

function SectionsList({
  bundle,
  hook,
  readOnly,
}: {
  bundle: CaseDesignBundle;
  hook: AdvancedDrawerHook;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-2">
      {bundle.sections.length === 0 && (
        <p className="text-xs text-zinc-500 italic py-2">
          No sections. Sections group related accounts on the PDF (e.g. “Continue Contributions”).
        </p>
      )}
      {bundle.sections.map((s) => (
        <SectionRow key={s.Id} section={s} hook={hook} readOnly={readOnly} />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() =>
            void hook.addSection({
              Label__c: "New Section",
              Section_Type__c: "Custom",
              Page_Number__c: 1,
              Style__c: "Standard",
            })
          }
          className="w-full px-3 py-2 text-xs font-medium border-2 border-dashed border-zinc-300 rounded-md text-zinc-600 hover:border-[#C7A356] hover:text-[#16253C] cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
        >
          + Add section
        </button>
      )}
    </div>
  );
}

function SectionRow({
  section,
  hook,
  readOnly,
}: {
  section: CaseDesignSection;
  hook: AdvancedDrawerHook;
  readOnly: boolean;
}) {
  const s = section;
  return (
    <div className="border border-zinc-200 rounded-md p-2.5 bg-white space-y-2">
      <input
        type="text"
        disabled={readOnly}
        defaultValue={s.Label__c}
        onBlur={(e) => {
          if (e.target.value !== s.Label__c) {
            void hook.updateSection(s.Id, { Label__c: e.target.value });
          }
        }}
        placeholder="Section label"
        className="w-full px-2 py-1 text-sm font-semibold border border-zinc-200 rounded focus:outline-none focus:border-[#C7A356] disabled:bg-zinc-50"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <select
          disabled={readOnly}
          value={s.Section_Type__c}
          onChange={(e) =>
            void hook.updateSection(s.Id, {
              Section_Type__c: e.target.value as SectionType,
            })
          }
          className="w-full px-2 py-1 text-xs border border-zinc-200 rounded focus:outline-none focus:border-[#C7A356] disabled:bg-zinc-50 bg-white"
        >
          {SECTION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          disabled={readOnly}
          value={s.Style__c}
          onChange={(e) =>
            void hook.updateSection(s.Id, {
              Style__c: e.target.value as CaseDesignSection["Style__c"],
            })
          }
          className="w-full px-2 py-1 text-xs border border-zinc-200 rounded focus:outline-none focus:border-[#C7A356] disabled:bg-zinc-50 bg-white"
        >
          <option value="Standard">Standard</option>
          <option value="Highlighted">Highlighted</option>
        </select>
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={() => void hook.deleteSection(s.Id)}
          className="text-[10px] text-rose-700 hover:text-rose-900 cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
        >
          Delete section
        </button>
      )}
    </div>
  );
}

/* ---------------- Annotations ---------------- */

function AnnotationsList({
  bundle,
  hook,
  readOnly,
}: {
  bundle: CaseDesignBundle;
  hook: AdvancedDrawerHook;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-2">
      {bundle.annotations.length === 0 && (
        <p className="text-xs text-zinc-500 italic py-2">
          No annotations. Annotations are free-text callouts (e.g. “HIGH PRIORITY”).
        </p>
      )}
      {bundle.annotations.map((a) => (
        <AnnotationRow key={a.Id} annotation={a} hook={hook} readOnly={readOnly} />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() =>
            void hook.addAnnotation({
              Text__c: "",
              Style__c: "Standard",
              Page_Number__c: 1,
            })
          }
          className="w-full px-3 py-2 text-xs font-medium border-2 border-dashed border-zinc-300 rounded-md text-zinc-600 hover:border-[#C7A356] hover:text-[#16253C] cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
        >
          + Add annotation
        </button>
      )}
    </div>
  );
}

function AnnotationRow({
  annotation,
  hook,
  readOnly,
}: {
  annotation: CaseDesignAnnotation;
  hook: AdvancedDrawerHook;
  readOnly: boolean;
}) {
  const a = annotation;
  return (
    <div className="border border-zinc-200 rounded-md p-2.5 bg-white space-y-2">
      <textarea
        disabled={readOnly}
        defaultValue={a.Text__c}
        onBlur={(e) => {
          if (e.target.value !== a.Text__c) {
            void hook.updateAnnotation(a.Id, { Text__c: e.target.value });
          }
        }}
        rows={2}
        placeholder="Annotation text"
        className="w-full px-2 py-1 text-xs border border-zinc-200 rounded focus:outline-none focus:border-[#C7A356] disabled:bg-zinc-50"
      />
      <select
        disabled={readOnly}
        value={a.Style__c}
        onChange={(e) =>
          void hook.updateAnnotation(a.Id, {
            Style__c: e.target.value as AnnotationStyle,
          })
        }
        className="w-full px-2 py-1 text-xs border border-zinc-200 rounded focus:outline-none focus:border-[#C7A356] disabled:bg-zinc-50 bg-white"
      >
        {ANNOTATION_STYLES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {!readOnly && (
        <button
          type="button"
          onClick={() => void hook.deleteAnnotation(a.Id)}
          className="text-[10px] text-rose-700 hover:text-rose-900 cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
        >
          Delete annotation
        </button>
      )}
    </div>
  );
}
