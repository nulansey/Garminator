// Shared inline-style primitives, consuming tokens.css. Keeps every form
// control / button / card / state-badge consistent without introducing a
// CSS framework — this project styles everything via inline `style={{}}`.

export const card = {
  background: "var(--surface-card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 12,
};

export const input = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  padding: 8,
};

export const button = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  cursor: "pointer",
  padding: "8px 12px",
};

export const buttonPrimary = {
  ...button,
  background: "var(--accent)",
  border: "none",
  color: "var(--surface-page)",
};

const badgeBase = { borderRadius: 6, padding: "2px 8px", display: "inline-block" };

export const badge = {
  good: { ...badgeBase, background: "var(--state-good-bg)", color: "var(--state-good-fg)" },
  warn: { ...badgeBase, background: "var(--state-warn-bg)", color: "var(--state-warn-fg)" },
  over: { ...badgeBase, background: "var(--state-over-bg)", color: "var(--state-over-fg)" },
};

export const textSecondary = { color: "var(--text-secondary)" };
export const textMuted = { color: "var(--text-muted)" };
