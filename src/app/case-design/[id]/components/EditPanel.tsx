/**
 * EditPanel — slide-in form that appears when an account card is clicked.
 * All field changes debounce through the parent hook (300ms). Advanced
 * fields (AV/SV/CV/DB, fees, dates) are collapsed by default to keep the
 * common path clean.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AccountType,
  CaseDesignBundle,
  CaseDesignPosition,
} from "@/lib/case-design/types";

const ACCOUNT_TYPES: AccountType[] = [
  "401k", "403b", "Roth 403b", "IRA", "Roth IRA", "Roth", "Simple IRA", "SEP IRA",
  "Inherited IRA", "Inherited IRA Trust", "NQ", "NQ-TOD", "Trust NQ", "Non Proto-Trust",
  "HSA", "1099", "Bank Savings", "Cash", "Crypto", "Whole Life", "Whole Life (Paid Up)",
  "IUL", "Variable Annuity", "Fixed Indexed Annuity", "Overseas Investment", "Other",
];

interface EditPanelProps {
  position: CaseDesignPosition;
  bundle: CaseDesignBundle;
  readOnly: boolean;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<CaseDesignPosition>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function EditPanel({
  position,
  bundle,
  readOnly,
  onClose,
  onUpdate,
  onDelete,
}: EditPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDestination = position.Role__c === "Destination";

  const knownCustodians = Array.from(
    new Set(
      bundle.positions
        .map((p) => p.Custodian__c)
        .filter((c): c is string => !!c && c !== position.Custodian__c)
    )
  );

  const sources = bundle.positions.filter((p) => p.Role__c === "Source");

  return (
    <div
      className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-96 bg-white border-l border-zinc-200 shadow-xl z-30 flex flex-col motion-reduce:transition-none"
      role="dialog"
      aria-label={`Edit ${position.Role__c.toLowerCase()} account`}
    >
      {/* Header */}
      <header className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between gap-2 bg-zinc-50">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Editing {position.Role__c}
          </div>
          <h3 className="text-sm font-bold text-[#16253C] truncate">
            {position.Owner_Label__c || "(no owner)"} · {position.Account_Type__c}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close edit panel"
          className="w-8 h-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-1 motion-reduce:transition-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <DebouncedTextField
          label="Owner"
          required
          value={position.Owner_Label__c}
          disabled={readOnly}
          placeholder="e.g. Daren, Joint, Trust"
          onCommit={(v) => onUpdate(position.Id, { Owner_Label__c: v })}
        />

        <div>
          <FieldLabel>Account Type</FieldLabel>
          <select
            disabled={readOnly}
            value={position.Account_Type__c}
            onChange={(e) =>
              void onUpdate(position.Id, { Account_Type__c: e.target.value as AccountType })
            }
            className={SELECT_CLASS}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {position.Account_Type__c === "Other" && (
          <DebouncedTextField
            label="Account Type — Other"
            value={position.Account_Type_Other__c ?? ""}
            disabled={readOnly}
            placeholder="e.g. Custodial UGMA"
            onCommit={(v) =>
              onUpdate(position.Id, { Account_Type_Other__c: v || null })
            }
          />
        )}

        <DebouncedTextField
          label="Custodian"
          required
          value={position.Custodian__c}
          disabled={readOnly}
          placeholder="e.g. Fidelity, Schwab, T. Rowe Price"
          datalistOptions={knownCustodians}
          onCommit={(v) => onUpdate(position.Id, { Custodian__c: v })}
        />

        <DebouncedTextField
          label="Product detail"
          value={position.Product_Detail__c ?? ""}
          disabled={readOnly}
          placeholder="e.g. Select 10 FIA"
          onCommit={(v) =>
            onUpdate(position.Id, { Product_Detail__c: v || null })
          }
        />

        <DebouncedTextField
          label="Account # last 4"
          value={position.Account_Number_Last4__c ?? ""}
          disabled={readOnly}
          maxLength={4}
          placeholder="5966"
          onCommit={(v) =>
            onUpdate(position.Id, { Account_Number_Last4__c: v || null })
          }
        />

        <CurrencyField
          label="Amount"
          value={position.Amount__c}
          disabled={readOnly}
          onCommit={(v) => onUpdate(position.Id, { Amount__c: v })}
        />

        {isDestination && (
          <div>
            <FieldLabel>Replaces source</FieldLabel>
            {position.Replaces_Position__c ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 border border-zinc-200 rounded-md bg-zinc-50">
                <span className="text-sm text-zinc-800 truncate">
                  {(() => {
                    const s = bundle.positions.find(
                      (p) => p.Id === position.Replaces_Position__c
                    );
                    if (!s) return "—";
                    return `${s.Owner_Label__c} · ${s.Account_Type__c}${s.Custodian__c ? ` · ${s.Custodian__c}` : ""}`;
                  })()}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onUpdate(position.Id, { Replaces_Position__c: null })}
                    className="text-[11px] text-rose-700 hover:text-rose-900 cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <>
                {showReplace ? (
                  <select
                    disabled={readOnly}
                    autoFocus
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) {
                        void onUpdate(position.Id, { Replaces_Position__c: v });
                        setShowReplace(false);
                      }
                    }}
                    className={SELECT_CLASS}
                  >
                    <option value="">— Pick a source —</option>
                    {sources.map((s) => (
                      <option key={s.Id} value={s.Id}>
                        {s.Owner_Label__c} · {s.Account_Type__c}
                        {s.Custodian__c ? ` · ${s.Custodian__c}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    disabled={readOnly || sources.length === 0}
                    onClick={() => setShowReplace(true)}
                    className="w-full px-3 py-2 text-xs font-medium border border-zinc-300 rounded-md text-zinc-700 hover:border-[#C7A356] hover:text-[#16253C] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 motion-reduce:transition-none"
                  >
                    {sources.length === 0
                      ? "No sources to replace"
                      : "Pick a source to replace…"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {(position.Source_Vault_Document_Name__c ||
          position.Verified__c ||
          position.Source_Confidence__c != null) && (
          <div>
            <FieldLabel>Source / Provenance</FieldLabel>
            <div className="text-xs text-zinc-700 px-3 py-2 border border-zinc-200 rounded-md bg-zinc-50 space-y-1">
              <div className="flex items-center gap-2">
                {position.Verified__c ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Verified
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold">Unverified</span>
                )}
                {position.Source_Confidence__c != null && (
                  <span className="text-zinc-500">· {position.Source_Confidence__c}% confidence</span>
                )}
              </div>
              {position.Source_Vault_Document_Name__c && (
                <div className="truncate text-zinc-600">{position.Source_Vault_Document_Name__c}</div>
              )}
            </div>
          </div>
        )}

        {/* Advanced disclosure */}
        <div className="border-t border-zinc-100 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((x) => !x)}
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 hover:text-[#16253C] cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
            aria-expanded={showAdvanced}
          >
            <svg
              className={`w-3 h-3 transition-transform duration-200 motion-reduce:transition-none ${showAdvanced ? "rotate-90" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            Advanced
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <CurrencyField
                  label="Account Value (AV)"
                  value={position.Account_Value__c}
                  disabled={readOnly}
                  onCommit={(v) => onUpdate(position.Id, { Account_Value__c: v })}
                />
                <CurrencyField
                  label="Surrender Value (SV)"
                  value={position.Surrender_Value__c}
                  disabled={readOnly}
                  onCommit={(v) => onUpdate(position.Id, { Surrender_Value__c: v })}
                />
                <CurrencyField
                  label="Cash Value (CV)"
                  value={position.Cash_Value__c}
                  disabled={readOnly}
                  onCommit={(v) => onUpdate(position.Id, { Cash_Value__c: v })}
                />
                <CurrencyField
                  label="Death Benefit (DB)"
                  value={position.Death_Benefit__c}
                  disabled={readOnly}
                  onCommit={(v) => onUpdate(position.Id, { Death_Benefit__c: v })}
                />
              </div>

              <DebouncedNumberField
                label="Annual fee %"
                value={position.Annual_Fee_Pct__c}
                step={0.01}
                disabled={readOnly}
                onCommit={(v) => onUpdate(position.Id, { Annual_Fee_Pct__c: v })}
              />

              <DebouncedTextField
                label="Fee display override"
                hint="Override the badge text. Use 'Consider Replacement if appropriate' for the call-out style."
                value={position.Annual_Fee_Display__c ?? ""}
                disabled={readOnly}
                onCommit={(v) =>
                  onUpdate(position.Id, { Annual_Fee_Display__c: v || null })
                }
              />

              <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={position.Fee_Is_Approximate__c}
                  onChange={(e) =>
                    void onUpdate(position.Id, {
                      Fee_Is_Approximate__c: e.target.checked,
                    })
                  }
                  className="accent-[#C7A356]"
                />
                Fee is approximate (renders with “~” prefix)
              </label>

              <DebouncedTextField
                label="Contribution note"
                value={position.Contribution_Note__c ?? ""}
                disabled={readOnly}
                placeholder="e.g. 9% PreTax / 6% Match"
                multiline
                onCommit={(v) =>
                  onUpdate(position.Id, { Contribution_Note__c: v || null })
                }
              />

              <DebouncedTextField
                label="Inception date"
                value={position.Inception_Date_Text__c ?? ""}
                disabled={readOnly}
                placeholder="e.g. Jan 2020"
                onCommit={(v) =>
                  onUpdate(position.Id, { Inception_Date_Text__c: v || null })
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {!readOnly && (
        <footer className="px-5 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-xs text-zinc-700">
              <span className="font-medium">Delete?</span>
              <button
                type="button"
                onClick={() => {
                  void onDelete(position.Id).then(() => onClose());
                }}
                className="px-2.5 py-1 text-xs font-semibold bg-rose-600 text-white rounded-md hover:bg-rose-700 cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 min-h-[36px] text-xs font-medium text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded-md cursor-pointer transition-colors duration-200 motion-reduce:transition-none"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 min-h-[36px] text-xs font-semibold bg-[#16253C] text-white rounded-md hover:bg-[#1E3456] cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none"
              >
                Done
              </button>
            </>
          )}
        </footer>
      )}
    </div>
  );
}

/* ---------------- Field primitives (debounced) ---------------- */

const FIELD_CLASS =
  "w-full px-3 py-2 text-sm border border-zinc-300 rounded-md focus:outline-none focus:border-[#C7A356] focus:ring-2 focus:ring-[#C7A356]/30 disabled:bg-zinc-50 disabled:cursor-not-allowed transition-colors duration-200 motion-reduce:transition-none";
const SELECT_CLASS = FIELD_CLASS + " bg-white";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">
      {children}
    </label>
  );
}

function useDebounced(value: string, ms: number, onFire: (v: string) => void) {
  const initial = useRef(value);
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onFireRef.current = onFire;
  });
  useEffect(() => {
    if (value === initial.current) return;
    const t = setTimeout(() => {
      onFireRef.current(value);
      initial.current = value;
    }, ms);
    return () => clearTimeout(t);
  }, [value, ms]);
}

function DebouncedTextField({
  label,
  value,
  onCommit,
  disabled,
  placeholder,
  hint,
  required,
  maxLength,
  multiline,
  datalistOptions,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  multiline?: boolean;
  datalistOptions?: string[];
}) {
  // Panel re-mounts on each position select (via key prop on parent), so local
  // state is initialized fresh from props each open. No sync-effect needed.
  const [local, setLocal] = useState(value);
  useDebounced(local, 300, (v) => {
    if (v !== value) onCommit(v);
  });

  const listId = datalistOptions && datalistOptions.length > 0
    ? `dl-${label.replace(/\s+/g, "-")}`
    : undefined;

  return (
    <div>
      <FieldLabel>
        {label}
        {required && <span className="text-rose-600 ml-0.5" aria-hidden="true">*</span>}
      </FieldLabel>
      {multiline ? (
        <textarea
          disabled={disabled}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          rows={2}
          placeholder={placeholder}
          maxLength={maxLength}
          className={FIELD_CLASS}
        />
      ) : (
        <input
          type="text"
          disabled={disabled}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          list={listId}
          className={FIELD_CLASS}
        />
      )}
      {listId && datalistOptions && (
        <datalist id={listId}>
          {datalistOptions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {hint && <p className="text-[10px] text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}

function DebouncedNumberField({
  label,
  value,
  onCommit,
  disabled,
  step,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  step?: number;
}) {
  const initialStr = value == null ? "" : String(value);
  const [local, setLocal] = useState(initialStr);
  useDebounced(local, 300, (v) => {
    const next = v === "" ? null : Number(v);
    const same =
      (next == null && value == null) || (next != null && next === value);
    if (!same && (next == null || !Number.isNaN(next))) {
      onCommit(next);
    }
  });

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        step={step ?? "any"}
        disabled={disabled}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className={FIELD_CLASS}
      />
    </div>
  );
}

function CurrencyField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
}) {
  // Show comma-formatted display while editing the raw number. Panel re-mounts
  // on position change (key prop on parent), so we initialize once from props.
  const [local, setLocal] = useState<string>(
    value == null ? "" : value.toLocaleString("en-US")
  );
  useDebounced(local, 300, (v) => {
    const clean = v.replace(/[, ]/g, "");
    const next = clean === "" ? null : Number(clean);
    const same =
      (next == null && value == null) || (next != null && next === value);
    if (!same && (next == null || !Number.isNaN(next))) {
      onCommit(next);
    }
  });

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 pointer-events-none">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            const clean = local.replace(/[, ]/g, "");
            if (clean === "" || Number.isNaN(Number(clean))) return;
            setLocal(Number(clean).toLocaleString("en-US"));
          }}
          onFocus={() => {
            setLocal(local.replace(/,/g, ""));
          }}
          placeholder="0"
          className={FIELD_CLASS + " pl-6"}
        />
      </div>
    </div>
  );
}
