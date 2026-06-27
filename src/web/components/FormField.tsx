import type { ReactNode } from "react";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, required = false, helperText, error, children }: FormFieldProps) {
  return (
    <div className="field">
      <div className="field-label-row">
        <label htmlFor={htmlFor}>{label}</label>
        {required ? <span aria-hidden="true" className="required-marker">*</span> : null}
      </div>
      {children}
      {helperText ? <p className="field-helper">{helperText}</p> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}
