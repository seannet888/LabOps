import { LogOut } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "../components/Button.js";
import { canAccess, navItems } from "./permissions.js";
import { useAuth } from "./auth.js";

const roleLabels = {
  sales: "销售",
  logistics: "后勤",
  manager: "管理员"
} as const;

export function AppShell() {
  const auth = useAuth();
  const user = auth.user;

  if (!user) {
    return null;
  }

  const visibleItems = navItems.filter((item) => canAccess(user.role, item));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup" aria-label="上海杰思捷实验动物有限公司">
          <span className="brand-mark" aria-hidden="true">JSJ</span>
          <div className="brand-copy">
            <p className="brand">杰思捷</p>
            <p className="brand-company">上海杰思捷实验动物有限公司</p>
          </div>
        </div>
        <nav aria-label="主导航" className="nav-list">
          {visibleItems.map((item) => (
            <NavLink key={item.path} className="nav-link" to={item.path}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div>
            <strong>{user.displayName}</strong>
            <span className="role-label">{roleLabels[user.role]}</span>
            <span className="role-code">{user.role}</span>
          </div>
          <Button variant="secondary" onClick={auth.logout}>
            <LogOut aria-hidden="true" size={16} />
            退出
          </Button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
