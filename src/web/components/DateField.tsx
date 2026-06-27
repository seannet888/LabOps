import type { InputHTMLAttributes } from "react";
import { Input } from "./Input.js";

export function DateField(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <Input type="date" {...props} />;
}
