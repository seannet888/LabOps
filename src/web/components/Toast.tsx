type ToastProps = {
  message: string;
  tone?: "success" | "warning" | "danger" | "neutral";
};

export function Toast({ message, tone = "neutral" }: ToastProps) {
  return <div className={`toast toast-${tone}`} role="status">{message}</div>;
}
