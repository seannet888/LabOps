import type { SelectHTMLAttributes } from "react";
import { cx } from "../lib/cx.js";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("text-control", className)} {...props} />;
}
