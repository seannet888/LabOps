import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.js";

type DrawerProps = {
  title: string;
  open: boolean;
  children: ReactNode;
  onClose: () => void;
};

export function Drawer({ title, open, children, onClose }: DrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <aside aria-modal="true" className="drawer" role="dialog" aria-labelledby="drawer-title">
      <header className="dialog-header">
        <h2 id="drawer-title">{title}</h2>
        <IconButton ariaLabel="关闭" icon={<X aria-hidden="true" size={16} />} onClick={onClose} />
      </header>
      {children}
    </aside>
  );
}
