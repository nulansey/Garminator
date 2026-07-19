// Shared Recharts theming. Import from here in every chart component so a
// metric's color is identical everywhere it appears — never redefine a
// series color locally. Values mirror tokens.css (single source of truth).

export const SERIES_COLORS = {
  burn: "var(--series-burn)",
  weight: "var(--series-weight)",
  hrv: "var(--series-hrv)",
  stress: "var(--series-stress)",
  rhr: "var(--series-rhr)",
  sleep: "var(--series-sleep)",
  extra: "var(--series-extra)",
};

export const chartTheme = {
  grid: "var(--border)",
  axisTick: "var(--text-muted)",
  axisLabel: "var(--text-secondary)",
  tooltip: {
    contentStyle: {
      background: "var(--surface-raised)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      color: "var(--text-primary)",
      fontSize: 12,
    },
    labelStyle: { color: "var(--text-secondary)" },
    itemStyle: { color: "var(--text-primary)" },
  },
};
