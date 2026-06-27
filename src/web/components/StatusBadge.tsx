import type { ReactNode } from "react";
import { cx } from "../lib/cx.js";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={cx("status-badge", `status-${tone}`)}>
      <span aria-hidden="true" className="status-dot" />
      {children}
    </span>
  );
}
