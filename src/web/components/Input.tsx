import type { InputHTMLAttributes } from "react";
import { cx } from "../lib/cx.js";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("text-control", className)} {...props} />;
}
