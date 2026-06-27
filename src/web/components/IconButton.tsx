import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  ariaLabel: string;
  icon: ReactNode;
};

export function IconButton({ ariaLabel, icon, ...props }: IconButtonProps) {
  return (
    <button className="icon-button" type="button" aria-label={ariaLabel} {...props}>
      {icon}
    </button>
  );
}
