import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.js";

type DialogProps = {
  title: string;
  open: boolean;
  children: ReactNode;
  onClose: () => void;
};

export function Dialog({ title, open, children, onClose }: DialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-modal="true" className="dialog" role="dialog" aria-labelledby="dialog-title">
        <header className="dialog-header">
          <h2 id="dialog-title">{title}</h2>
          <IconButton ariaLabel="关闭" icon={<X aria-hidden="true" size={16} />} onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
