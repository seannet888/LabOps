type EmptyStateProps = {
  title?: string;
  message: string;
};

export function EmptyState({ title = "暂无数据", message }: EmptyStateProps) {
  return (
    <div className="state-box">
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
