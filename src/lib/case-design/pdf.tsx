/**
 * Case Design PDF renderer — @react-pdf/renderer document that mirrors the
 * interactive diagram exactly. Uses the same dagre auto-layout the live
 * builder uses, so the artifact the client receives is byte-equivalent to
 * what the advisor signed off on.
 */

import React from "react";
import { Document, Page, Text, View, StyleSheet, Svg, Path, Line, G } from "@react-pdf/renderer";
import {
  layoutDiagram,
  formatValueDisplay,
  formatFeeBadge,
  methodLabel,
  NODE_WIDTH,
  NODE_HEIGHT,
} from "./auto-layout";
import type {
  CaseDesignBundle,
  CaseDesignTab,
  CaseDesignPosition,
  CaseDesignSection,
  CaseDesignAnnotation,
} from "./types";

const NAVY = "#16253C";
const GOLD = "#C7A356";
const BLUE = "#1E40AF";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18, alignItems: "flex-start" },
  brand: { fontSize: 16, fontWeight: 700, color: NAVY, letterSpacing: 1 },
  brandSub: { fontSize: 8, color: NAVY, letterSpacing: 4, marginTop: 2 },
  titleBlock: { alignItems: "flex-end" },
  household: { fontSize: 11, color: "#374151" },
  title: { fontSize: 12, fontWeight: 700, color: NAVY },
  stageLabel: { fontSize: 10, fontWeight: 700, color: GOLD, marginTop: 2 },
  date: { fontSize: 10, color: "#6B7280", marginTop: 2 },
  sectionHeader: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "#111827",
    marginTop: 8,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: "1pt solid #9CA3AF",
    paddingHorizontal: 80,
  },
  canvasWrap: { position: "relative" },
  nodeBox: {
    position: "absolute",
    backgroundColor: "white",
    borderRadius: 4,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  ownerName: { color: BLUE, fontSize: 9, fontWeight: 700, textAlign: "center" },
  acctType: { color: BLUE, fontSize: 9, textAlign: "center", marginBottom: 4 },
  custodian: { fontSize: 9, fontWeight: 700, textAlign: "center" },
  product: { fontSize: 8, textAlign: "center", color: "#374151" },
  suffix: { fontSize: 7, textAlign: "center", color: "#6B7280" },
  amount: { fontSize: 10, fontWeight: 700, textAlign: "center", marginTop: 4 },
  feePill: {
    position: "absolute",
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "#9CA3AF",
    paddingHorizontal: 4,
    paddingVertical: 1,
    fontSize: 7,
    color: "#374151",
  },
  edgeLabel: {
    position: "absolute",
    fontSize: 7,
    color: "#111827",
    backgroundColor: "white",
    paddingHorizontal: 2,
  },
  annotationCard: {
    marginTop: 8,
    padding: 6,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "#9CA3AF",
    fontSize: 8,
  },
  highPriority: { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" },
  disclaimer: { fontSize: 7, color: "#6B7280", marginTop: 4, textAlign: "center" },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, fontSize: 7, color: "#9CA3AF", textAlign: "center" },
});

const DISCLAIMER_ROTH = "Roth conversions and/or distributions may impact many facets of your financial situation including but not limited to: marginal tax rates, Medicare or ACA premiums, Social Security benefit taxation, government assistance or stimulus eligibility, etc.";
const DISCLAIMER_GENERAL = "Neither the firm, its agents, or representatives may give tax or legal advice. Please consult with your tax professional to review any applicable implications before making a financial decision.";

export interface CaseDesignPDFProps {
  bundle: CaseDesignBundle;
  householdLabel: string;
}

/** Lowest tab Page_Number, or 1 when there are no tabs. */
function firstTabPage(tabs: CaseDesignTab[]): number {
  if (tabs.length === 0) return 1;
  return tabs.reduce((min, t) => Math.min(min, t.Page_Number__c || 1), Infinity) || 1;
}

export function CaseDesignPDF({ bundle, householdLabel }: CaseDesignPDFProps) {
  const { parent, tabs, sections, positions, edges, annotations } = bundle;
  const firstPage = firstTabPage(tabs);

  // The set of pages to render: every tab's page, plus any page referenced by
  // a position / section / annotation, plus page 1 so an empty design still
  // prints one page. Records with a null Page_Number resolve to the first page.
  const pageNumbers = Array.from(
    new Set([
      ...tabs.map((t) => t.Page_Number__c || 1),
      ...positions.map((p) => p.Page_Number__c ?? firstPage),
      ...sections.map((s) => s.Page_Number__c || 1),
      ...annotations.map((a) => a.Page_Number__c || 1),
      1,
    ])
  ).sort((a, b) => a - b);

  // Map each page → its tab (for the header label/date). No tab → undefined,
  // which preserves the legacy header (Document_Title only).
  const tabByPage = new Map<number, CaseDesignTab>();
  for (const t of tabs) tabByPage.set(t.Page_Number__c || 1, t);

  return (
    <Document>
      {pageNumbers.map((pn) => (
        <PageContent
          key={pn}
          pageNumber={pn}
          firstPage={firstPage}
          tab={tabByPage.get(pn)}
          parent={bundle.parent}
          allPositions={positions}
          allEdges={edges}
          sections={sections.filter((s) => (s.Page_Number__c || 1) === pn)}
          annotations={annotations.filter((a) => (a.Page_Number__c || 1) === pn)}
          householdLabel={householdLabel}
          isFirstPage={pn === pageNumbers[0]}
          totalPages={pageNumbers.length}
          pageIndex={pageNumbers.indexOf(pn) + 1}
          allHasRoth={parent.Has_Roth_Conversion__c}
        />
      ))}
    </Document>
  );
}

function PageContent(props: {
  pageNumber: number;
  firstPage: number;
  tab: CaseDesignTab | undefined;
  parent: CaseDesignBundle["parent"];
  allPositions: CaseDesignPosition[];
  allEdges: CaseDesignBundle["edges"];
  sections: CaseDesignSection[];
  annotations: CaseDesignAnnotation[];
  householdLabel: string;
  isFirstPage: boolean;
  totalPages: number;
  pageIndex: number;
  allHasRoth: boolean;
}) {
  const { parent, tab, allPositions, allEdges, sections, annotations, householdLabel, totalPages, pageIndex, allHasRoth, firstPage } = props;

  // Does ANY position carry an explicit Page_Number? If so we're in the
  // tab-driven model and page membership follows Page_Number. Otherwise fall
  // back to the legacy section-driven paging so untabbed designs are unchanged.
  const hasExplicitPaging = allPositions.some((p) => p.Page_Number__c != null);

  const pagePositionIds = new Set(
    allPositions
      .filter((p) => {
        if (hasExplicitPaging) {
          // null Page_Number resolves to the first page.
          return (p.Page_Number__c ?? firstPage) === props.pageNumber;
        }
        // Legacy: positions whose section is on this page, or unsectioned → page 1.
        const sec = sections.find((s) => s.Id === p.Section__c);
        if (sec) return true;
        return props.pageNumber === 1 && !p.Section__c;
      })
      .map((p) => p.Id)
  );
  const pagePositions = allPositions.filter((p) => pagePositionIds.has(p.Id));
  const pageEdges = allEdges.filter(
    (e) => pagePositionIds.has(e.From_Position__c) && pagePositionIds.has(e.To_Position__c)
  );

  const layout = layoutDiagram(pagePositions, pageEdges);

  // canvas viewport — page width is letter (612pt), minus 72pt padding = 540pt usable
  const PAGE_USABLE_W = 540;
  const scale = layout.width > 0 ? Math.min(1, PAGE_USABLE_W / layout.width) : 1;
  const drawW = layout.width * scale;
  const drawH = layout.height * scale;

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>CAPITAL</Text>
          <Text style={styles.brandSub}>WEALTH ADVISORS</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.household}>{householdLabel}</Text>
          <Text style={styles.title}>{parent.Document_Title__c || "Retirement Money Map"}</Text>
          {tab ? (
            <>
              <Text style={styles.stageLabel}>{tab.Label__c}</Text>
              <Text style={styles.date}>
                {formatPlanDate(tab.Tab_Date__c ?? parent.Plan_Date__c)}
              </Text>
            </>
          ) : (
            <Text style={styles.date}>{formatPlanDate(parent.Plan_Date__c)}</Text>
          )}
        </View>
      </View>

      {sections.map((s) => (
        <Text key={s.Id} style={styles.sectionHeader}>{s.Label__c}</Text>
      ))}

      <View style={[styles.canvasWrap, { height: drawH }]}>
        <Svg width={drawW} height={drawH} viewBox={`0 0 ${layout.width} ${layout.height}`}>
          {/* edges first so they sit under boxes */}
          <G>
            {layout.edges.map((e) => {
              const from = layout.nodes.find((n) => n.id === e.from);
              const to = layout.nodes.find((n) => n.id === e.to);
              if (!from || !to) return null;
              const x1 = from.x + from.width;
              const y1 = from.y + from.height / 2;
              const x2 = to.x;
              const y2 = to.y + to.height / 2;
              const midX = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
              return <Path key={e.id} d={d} stroke="#374151" strokeWidth={1} fill="none" />;
            })}
          </G>
          {/* node curly braces (decorative) */}
          <G>
            {layout.nodes.map((n) => (
              <G key={`brace-${n.id}`}>
                {curlyBrace(n.x, n.y, n.height, "left")}
                {curlyBrace(n.x + n.width, n.y, n.height, "right")}
              </G>
            ))}
          </G>
        </Svg>

        {/* node boxes — siblings of the SVG so absolute positioning anchors to canvasWrap */}
        {layout.nodes.map((n) => {
          const p = n.position;
          return (
            <View
              key={`box-${n.id}`}
              style={[
                styles.nodeBox,
                {
                  left: n.x * scale + 8,
                  top: n.y * scale,
                  width: (n.width - 16) * scale,
                  height: n.height * scale,
                },
              ]}
            >
              <Text style={styles.ownerName}>{p.Owner_Label__c}</Text>
              <Text style={styles.acctType}>
                {p.Account_Type__c === "Other" && p.Account_Type_Other__c
                  ? p.Account_Type_Other__c
                  : p.Account_Type__c}
              </Text>
              <Text style={styles.custodian}>{p.Custodian__c}</Text>
              {p.Product_Detail__c && <Text style={styles.product}>{p.Product_Detail__c}</Text>}
              {p.Account_Number_Last4__c && (
                <Text style={styles.suffix}>...{p.Account_Number_Last4__c}</Text>
              )}
              <Text style={styles.amount}>{formatValueDisplay(p)}</Text>
            </View>
          );
        })}
        {/* fee pills as flat siblings — each is its own absolutely-positioned element */}
        {layout.nodes.map((n) => {
          const fee = formatFeeBadge(n.position);
          if (!fee) return null;
          return (
            <Text
              key={`fee-${n.id}`}
              style={[
                styles.feePill,
                {
                  left: n.x * scale + (n.width - 16) * scale * 0.15,
                  top: (n.y + n.height) * scale - 4,
                },
              ]}
            >
              {fee}
            </Text>
          );
        })}

        {/* edge labels */}
        {layout.edges.map((e) => {
          const from = layout.nodes.find((n) => n.id === e.from);
          const to = layout.nodes.find((n) => n.id === e.to);
          if (!from || !to) return null;
          const midX = (from.x + from.width + to.x) / 2;
          const midY = (from.y + to.y + from.height / 2 + to.height / 2) / 2;
          return (
            <Text
              key={`lbl-${e.id}`}
              style={[styles.edgeLabel, { left: midX * scale - 20, top: midY * scale - 4 }]}
            >
              {methodLabel(e.edge)}
            </Text>
          );
        })}
      </View>

      {annotations.length > 0 && (
        <View>
          {annotations.map((a) => (
            <View
              key={a.Id}
              style={[styles.annotationCard, a.Style__c === "High Priority" ? styles.highPriority : {}]}
            >
              {a.Style__c === "High Priority" && (
                <Text style={{ fontWeight: 700, fontSize: 8, marginBottom: 2 }}>HIGH PRIORITY</Text>
              )}
              <Text>{a.Text__c}</Text>
            </View>
          ))}
        </View>
      )}

      {allHasRoth && pageIndex === totalPages && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.disclaimer}>{DISCLAIMER_ROTH}</Text>
          <Text style={styles.disclaimer}>{DISCLAIMER_GENERAL}</Text>
        </View>
      )}

      <Text style={styles.footer}>
        {householdLabel} · {parent.Document_Title__c || "Retirement Money Map"}
        {tab ? ` · ${tab.Label__c}` : ""} ·{" "}
        {formatPlanDate(tab?.Tab_Date__c ?? parent.Plan_Date__c)} · Page {pageIndex} of {totalPages}
      </Text>
    </Page>
  );
}

function curlyBrace(x: number, y: number, h: number, side: "left" | "right") {
  const w = 6;
  const x2 = side === "left" ? x + w : x - w;
  return (
    <>
      <Line x1={x} y1={y} x2={x2} y2={y} stroke="#9CA3AF" strokeWidth={0.6} />
      <Line x1={x} y1={y} x2={x} y2={y + h} stroke="#9CA3AF" strokeWidth={0.6} />
      <Line x1={x} y1={y + h} x2={x2} y2={y + h} stroke="#9CA3AF" strokeWidth={0.6} />
    </>
  );
}

function formatPlanDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return d;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = months[dt.getMonth()];
  const day = dt.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st" :
                 day === 2 || day === 22 ? "nd" :
                 day === 3 || day === 23 ? "rd" : "th";
  return `${month} ${day}${suffix}, ${dt.getFullYear()}`;
}
