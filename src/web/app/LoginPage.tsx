import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { ApiClientError } from "../lib/api-client.js";
import { useAuth } from "./auth.js";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await auth.login({ username, password });
      navigate("/orders", { replace: true });
    } catch (loginError) {
      if (loginError instanceof ApiClientError) {
        setError(`${loginError.message}（${loginError.requestId}）`);
      } else {
        setError("登录失败，请重试");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>实验动物销售管理</h1>
        <div className="field">
          <label htmlFor="username">用户名</label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <Button loading={loading} type="submit">登录</Button>
      </form>
    </main>
  );
}
