/**
 * Visual Table & Diagram Generation System
 * Generates clean, publication-ready tables and diagrams for NIH grants.
 * Replaces markdown tables with semantic React components.
 */

import React from "react";

export interface TableColumn {
  header: string;
  key: string;
  width?: string;
  align?: "left" | "center" | "right";
}

export interface TableRow {
  [key: string]: string | number | React.ReactNode;
}

export interface TableProps {
  columns: TableColumn[];
  rows: TableRow[];
  caption?: string;
  className?: string;
}

/**
 * Renders a clean, NIH-compliant table with proper formatting.
 */
export function generateNIHTable({ columns, rows, caption, className = "" }: TableProps): React.ReactElement {
  return (
    <div className={`overflow-x-auto my-4 ${className}`}>
      <table className="min-w-full border-collapse border border-zinc-300 text-sm">
        {caption && (
          <caption className="caption-top text-xs font-semibold text-zinc-700 mb-2">
            {caption}
          </caption>
        )}
        <thead>
          <tr className="bg-zinc-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`border border-zinc-300 px-3 py-2 font-semibold text-zinc-900 ${
                  col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-white" : "bg-zinc-50"}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`border border-zinc-300 px-3 py-2 ${
                    col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Generates an NIH-style Specific Aims table.
 */
export function generateSpecificAimsTable(aims: Array<{
  aim: string;
  metric: string;
  expectedResult: string;
  statisticalTarget: string;
}>): React.ReactElement {
  const columns: TableColumn[] = [
    { header: "Aim", key: "aim", width: "25%" },
    { header: "Metric", key: "metric", width: "25%" },
    { header: "Expected Result", key: "expectedResult", width: "25%" },
    { header: "Statistical Target", key: "statisticalTarget", width: "25%" },
  ];

  const rows: TableRow[] = aims.map((aim, i) => ({
    aim: `Aim ${i + 1}: ${aim.aim}`,
    metric: aim.metric,
    expectedResult: aim.expectedResult,
    statisticalTarget: aim.statisticalTarget,
  }));

  return generateNIHTable({
    columns,
    rows,
    caption: "Table 1. Specific Aims with Metrics and Statistical Targets",
  });
}

/**
 * Generates a power analysis table with ICC adjustment.
 */
export function generatePowerAnalysisTable(scenarios: Array<{
  scenario: string;
  totalN: number;
  clusterSize: number;
  icc: number;
  effectiveN: number;
  designEffect: number;
  adequate: boolean;
}>): React.ReactElement {
  const columns: TableColumn[] = [
    { header: "Scenario", key: "scenario", width: "20%" },
    { header: "Total N", key: "totalN", width: "12%" },
    { header: "Cluster Size", key: "clusterSize", width: "12%" },
    { header: "ICC (ρ)", key: "icc", width: "10%" },
    { header: "Design Effect", key: "designEffect", width: "12%" },
    { header: "Effective N", key: "effectiveN", width: "12%" },
    { header: "Adequate?", key: "adequate", width: "10%" },
  ];

  const rows: TableRow[] = scenarios.map((scenario) => ({
    scenario: scenario.scenario,
    totalN: scenario.totalN.toLocaleString(),
    clusterSize: scenario.clusterSize,
    icc: scenario.icc.toFixed(3),
    designEffect: scenario.designEffect.toFixed(3),
    effectiveN: scenario.effectiveN.toLocaleString(),
    adequate: scenario.adequate ? "✓ Yes" : "✗ No",
  }));

  return generateNIHTable({
    columns,
    rows,
    caption: "Table 2. Power Analysis with Intraclass Correlation (ICC) Adjustment for Cluster-Randomized Design",
  });
}

/**
 * Generates a timeline diagram.
 */
export function generateTimelineDiagram(phases: Array<{
  phase: string;
  startMonth: number;
  duration: number;
  color?: string;
}>): React.ReactElement {
  const colors = [
    "bg-indigo-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-violet-500",
  ];

  return (
    <div className="my-4 overflow-x-auto">
      <div className="relative">
        {/* Timeline axis */}
        <div className="flex items-center mb-2">
          <div className="w-24 text-xs text-zinc-500">Timeline:</div>
          <div className="flex-1 h-px bg-zinc-300 relative">
            {Array.from({ length: 13 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-2 w-px bg-zinc-400"
                style={{ left: `${(i / 12) * 100}%` }}
              />
            ))}
          </div>
        </div>

        {/* Phase bars */}
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center mb-2">
            <div className="w-24 text-xs text-zinc-700 truncate">{phase.phase}</div>
            <div className="flex-1 relative h-6">
              <div
                className={`absolute h-4 rounded ${phase.color || colors[i % colors.length]}`}
                style={{
                  left: `${(phase.startMonth / 12) * 100}%`,
                  width: `${(phase.duration / 12) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}

        {/* Month labels */}
        <div className="flex items-center mt-1">
          <div className="w-24" />
          <div className="flex-1 flex justify-between text-[10px] text-zinc-500">
            <span>M0</span>
            <span>M3</span>
            <span>M6</span>
            <span>M9</span>
            <span>M12</span>
          </div>
        </div>
      </div>
    </div>
  );
}
