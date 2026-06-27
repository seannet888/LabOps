import type { TextareaHTMLAttributes } from "react";
import { cx } from "../lib/cx.js";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("text-control textarea-control", className)} {...props} />;
}
