type ErrorStateProps = {
  title?: string;
  message: string;
  requestId?: string;
};

export function ErrorState({ title = "请求失败", message, requestId }: ErrorStateProps) {
  return (
    <div className="state-box error-state" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
      {requestId ? <small>request_id: {requestId}</small> : null}
    </div>
  );
}
