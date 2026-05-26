/**
 * VaultSidebar — left rail listing household ContentDocuments + Meeting 1
 * intake assets. Selecting a document shows its metadata + a Salesforce link.
 * Assets are lifted up to the parent for the source autocomplete via callback.
 */
"use client";

import { useEffect, useState } from "react";
import type { MeetingIntakeAsset } from "@/lib/case-design/sf-client";

interface HouseholdDocument {
  contentDocumentId: string;
  contentVersionId: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdDate: string;
  linkedEntityName: string;
}

interface VaultSidebarProps {
  caseDesignId: string;
  onAssetsLoaded?: (assets: MeetingIntakeAsset[]) => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function VaultSidebar({ caseDesignId, onAssetsLoaded }: VaultSidebarProps) {
  const [docs, setDocs] = useState<HouseholdDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/case-design/${caseDesignId}/vault-docs?include=assets`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Failed (${res.status})`);
        }
        const data = (await res.json()) as {
          documents: HouseholdDocument[];
          assets?: MeetingIntakeAsset[];
        };
        if (cancelled) return;
        setDocs(data.documents ?? []);
        if (onAssetsLoaded) onAssetsLoaded(data.assets ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseDesignId, onAssetsLoaded]);

  const grouped = docs.reduce<Record<string, HouseholdDocument[]>>((acc, d) => {
    const key = d.linkedEntityName || "Other";
    (acc[key] ||= []).push(d);
    return acc;
  }, {});

  const selected = docs.find((d) => d.contentDocumentId === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Household Vault
        </h2>
        <p className="text-[11px] text-zinc-500">Client uploads + statements</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="px-4 py-6 text-sm text-zinc-500">Loading documents...</div>
        )}
        {error && (
          <div className="m-4 px-3 py-2 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded">
            {error}
          </div>
        )}
        {!loading && !error && docs.length === 0 && (
          <div className="px-4 py-6 text-sm text-zinc-500">
            No household documents yet.
          </div>
        )}

        {Object.entries(grouped).map(([group, rows]) => (
          <div key={group}>
            <div className="px-4 py-1.5 bg-zinc-100 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-200">
              {group} ({rows.length})
            </div>
            {rows.map((d) => {
              const active = d.contentDocumentId === selectedId;
              return (
                <button
                  key={d.contentDocumentId}
                  type="button"
                  onClick={() => setSelectedId(d.contentDocumentId)}
                  className={`w-full text-left px-4 py-2 border-b border-zinc-100 hover:bg-[#C7A356]/10 ${
                    active ? "bg-[#C7A356]/15 border-l-2 border-l-[#C7A356]" : ""
                  }`}
                >
                  <div className="text-xs font-medium text-zinc-900 truncate">
                    {d.title}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {d.fileType} · {formatBytes(d.fileSize)} ·{" "}
                    {new Date(d.createdDate).toLocaleDateString()}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 min-h-[140px]">
        {selected ? (
          <>
            <div className="text-xs font-semibold text-zinc-800 mb-1 truncate">
              {selected.title}
            </div>
            <dl className="text-[11px] text-zinc-600 space-y-0.5 mb-2">
              <div>
                <dt className="inline text-zinc-400">File: </dt>
                <dd className="inline">{selected.fileName}</dd>
              </div>
              <div>
                <dt className="inline text-zinc-400">Type: </dt>
                <dd className="inline">{selected.fileType}</dd>
              </div>
              <div>
                <dt className="inline text-zinc-400">Size: </dt>
                <dd className="inline">{formatBytes(selected.fileSize)}</dd>
              </div>
              <div>
                <dt className="inline text-zinc-400">CV Id: </dt>
                <dd className="inline font-mono">{selected.contentVersionId}</dd>
              </div>
            </dl>
            <a
              href={`/lightning/r/ContentDocument/${selected.contentDocumentId}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1.5 text-[11px] font-medium bg-[#16253C] text-white rounded hover:bg-[#1E3456]"
            >
              Open in Salesforce
            </a>
          </>
        ) : (
          <p className="text-[11px] text-zinc-400">
            Select a document to view metadata.
          </p>
        )}
      </div>
    </div>
  );
}
