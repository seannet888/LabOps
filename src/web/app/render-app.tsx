import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.js";
import { AppShell } from "./AppShell.js";
import { LoginPage } from "./LoginPage.js";
import { PlaceholderPage } from "./pages.js";
import { InventoryAvailabilityPage } from "../features/inventory/InventoryAvailabilityPage.js";
import { InventoryBatchesPage } from "../features/inventory/InventoryBatchesPage.js";
import { OrdersListPage } from "../features/orders/OrdersListPage.js";
import { OrderCreatePage } from "../features/orders/OrderCreatePage.js";
import { OrderDetailPage } from "../features/orders/OrderDetailPage.js";
import { DeliveryTaskDetailPage } from "../features/delivery/DeliveryTaskDetailPage.js";
import { DeliveryTasksPage } from "../features/delivery/DeliveryTasksPage.js";
import { CustomersPage } from "../features/customers/CustomersPage.js";
import { AuditLogsPage } from "../features/audit/AuditLogsPage.js";

type RenderAppOptions = {
  initialEntries?: string[];
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

function ProtectedShell() {
  const auth = useAuth();

  if (auth.initializing) {
    return <main className="login-page">正在恢复会话</main>;
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

function LoginRoute() {
  const auth = useAuth();

  if (auth.user) {
    return <Navigate to="/orders" replace />;
  }

  return <LoginPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedShell />}>
        <Route index element={<Navigate to="/orders" replace />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/inventory/batches" element={<InventoryBatchesPage />} />
        <Route path="/inventory/availability" element={<InventoryAvailabilityPage />} />
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/new" element={<OrderCreatePage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        <Route path="/delivery-tasks" element={<DeliveryTasksPage />} />
        <Route path="/delivery-tasks/:taskId" element={<DeliveryTaskDetailPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/delivery-strategy-rules" element={<PlaceholderPage page="strategyRules" />} />
        <Route path="/exports/orders" element={<PlaceholderPage page="exports" />} />
      </Route>
    </Routes>
  );
}

function Router({ children, initialEntries }: { children: ReactNode; initialEntries?: string[] }) {
  if (initialEntries) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
  }

  return <BrowserRouter>{children}</BrowserRouter>;
}

export function renderApp(options: RenderAppOptions = {}): ReactElement {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <Router initialEntries={options.initialEntries}>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
