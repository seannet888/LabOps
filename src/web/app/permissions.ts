import type { UserRole } from "./auth.js";
import type { CurrentUser } from "./auth.js";

export type NavItem = {
  label: string;
  path: string;
  roles: UserRole[];
};

export const navItems: NavItem[] = [
  { label: "客户", path: "/customers", roles: ["sales", "logistics", "manager"] },
  { label: "库存", path: "/inventory/batches", roles: ["sales", "logistics", "manager"] },
  { label: "订单", path: "/orders", roles: ["sales", "logistics", "manager"] },
  { label: "配送", path: "/delivery-tasks", roles: ["sales", "logistics", "manager"] },
  { label: "审计", path: "/audit-logs", roles: ["manager"] },
  { label: "策略", path: "/delivery-strategy-rules", roles: ["sales", "manager"] },
  { label: "导出", path: "/exports/orders", roles: ["sales", "manager"] }
];

export function canAccess(role: UserRole, item: NavItem): boolean {
  return item.roles.includes(role);
}

export type PermissionAction =
  | "customers:read"
  | "customers:create"
  | "customers:update"
  | "customers:update_delivery_address"
  | "inventory:read"
  | "inventory_batches:create"
  | "strains:create"
  | "orders:read"
  | "orders:create"
  | "orders:confirm"
  | "orders:change_prices"
  | "orders:cancel"
  | "orders:settle"
  | "delivery_tasks:read"
  | "delivery_tasks:schedule"
  | "delivery_tasks:confirm_shipment"
  | "delivery_tasks:confirm_delivery"
  | "delivery_tasks:flag_sales_action"
  | "orders:export"
  | "audit_logs:read";

const actionRoles: Record<PermissionAction, UserRole[]> = {
  "customers:read": ["sales", "logistics", "manager"],
  "customers:create": ["sales", "manager"],
  "customers:update": ["sales", "manager"],
  "customers:update_delivery_address": ["sales", "manager"],
  "inventory:read": ["sales", "logistics", "manager"],
  "inventory_batches:create": ["sales", "manager"],
  "strains:create": ["manager"],
  "orders:read": ["sales", "logistics", "manager"],
  "orders:create": ["sales", "manager"],
  "orders:confirm": ["sales", "manager"],
  "orders:change_prices": ["sales", "manager"],
  "orders:cancel": ["sales", "manager"],
  "orders:settle": ["sales", "manager"],
  "delivery_tasks:read": ["sales", "logistics", "manager"],
  "delivery_tasks:schedule": ["logistics", "manager"],
  "delivery_tasks:confirm_shipment": ["logistics", "manager"],
  "delivery_tasks:confirm_delivery": ["logistics", "manager"],
  "delivery_tasks:flag_sales_action": ["logistics", "manager"],
  "orders:export": ["sales", "manager"],
  "audit_logs:read": ["manager"]
};

export function canPerform(roleOrUser: UserRole | CurrentUser, action: PermissionAction): boolean {
  const role = typeof roleOrUser === "string" ? roleOrUser : roleOrUser.role;
  return actionRoles[action].includes(role);
}
