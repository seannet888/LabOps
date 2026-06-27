import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx.js";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  variant?: "primary" | "secondary";
};

export function Button({ children, className, disabled, loading = false, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cx("button", variant === "secondary" && "secondary", className)}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      {...props}
    >
      {loading ? "处理中..." : null}
      {children}
    </button>
  );
}
