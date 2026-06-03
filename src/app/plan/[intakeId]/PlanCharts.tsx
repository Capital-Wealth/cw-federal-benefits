"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ReferenceLine,
} from "recharts";
import type { CalculationResult } from "@/lib/calc-types";

const NAVY = "#16253C";
const GOLD = "#FDD25E";
const BLUE = "#2b7bb9";
const RED = "#DC2626";
const GREEN = "#059669";

export function ColaChart({ result }: { result: CalculationResult }) {
  const data = result.colaProjections.slice(0, 25).map((p) => ({
    age: p.year - new Date(result.colaProjections[0].year).valueOf() / 31557600 / 1000 + 0,
    year: p.year,
    annual: Math.round(p.annuityAfterCola),
    monthly: Math.round(p.annuityAfterCola / 12),
  }));
  return (
    <ChartCard title="Annuity with COLA — 25 years">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="annuityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.7} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
          <XAxis dataKey="year" stroke="#6B7280" fontSize={11} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#6B7280" fontSize={11} />
          <Tooltip
            formatter={((v: number | string) => `$${Number(v).toLocaleString()}`) as never}
            contentStyle={{ background: NAVY, border: "none", color: "#fff", borderRadius: 4, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="annual" stroke={GOLD} strokeWidth={2} fill="url(#annuityGradient)" name="Annual Annuity" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TspChart({ result }: { result: CalculationResult }) {
  const trad = result.tsp.traditionalProjections.slice(0, 30);
  const roth = result.tsp.rothProjections.slice(0, 30);
  const data = trad.map((t, i) => ({
    year: t.year,
    age: t.age,
    Traditional: Math.round(t.endBalance),
    Roth: Math.round(roth[i]?.endBalance ?? 0),
    Total: Math.round((t.endBalance) + (roth[i]?.endBalance ?? 0)),
  }));
  return (
    <ChartCard title="TSP Balance Over Time">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
          <XAxis dataKey="age" stroke="#6B7280" fontSize={11} label={{ value: "Age", position: "insideBottom", offset: -2, fontSize: 10, fill: "#6B7280" }} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#6B7280" fontSize={11} />
          <Tooltip
            formatter={((v: number | string) => `$${Number(v).toLocaleString()}`) as never}
            contentStyle={{ background: NAVY, border: "none", color: "#fff", borderRadius: 4, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Total" stroke={GOLD} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="Traditional" stroke={BLUE} strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="Roth" stroke={GREEN} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function NetCashflowChart({ result }: { result: CalculationResult }) {
  const data = result.yearlyProjections.slice(0, 25).map((p) => ({
    year: p.year,
    age: p.age,
    Government: Math.round(p.annuity + p.fersSupplement),
    Other: Math.round(p.socialSecurity + p.tspWithdrawal + p.otherIncome),
    Expenses: -Math.round(p.fegliCost + p.fehbCost + p.federalTax + p.stateTax + p.livingExpenses),
  }));
  return (
    <ChartCard title="Annual Income Streams vs Expenses">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }} stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
          <XAxis dataKey="age" stroke="#6B7280" fontSize={11} label={{ value: "Age", position: "insideBottom", offset: -2, fontSize: 10, fill: "#6B7280" }} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#6B7280" fontSize={11} />
          <Tooltip
            formatter={((v: number | string) => `$${Math.abs(Number(v)).toLocaleString()}`) as never}
            contentStyle={{ background: NAVY, border: "none", color: "#fff", borderRadius: 4, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="#000" strokeOpacity={0.3} />
          <Area dataKey="Government" stackId="income" stroke={GOLD} fill={GOLD} fillOpacity={0.6} />
          <Area dataKey="Other" stackId="income" stroke={BLUE} fill={BLUE} fillOpacity={0.5} />
          <Area dataKey="Expenses" stackId="expenses" stroke={RED} fill={RED} fillOpacity={0.4} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#16253C", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, paddingBottom: 2, borderBottom: "1px solid #FDD25E", display: "inline-block", paddingRight: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
