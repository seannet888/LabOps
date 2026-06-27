import { UnauthorizedError } from "../errors.js";
import type { SessionRepository, UserRepository, UserRole } from "../shared/types.js";
import { verifyPassword } from "./password.js";
import { generateSessionToken, hashSessionToken } from "./session-token.js";

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const SESSION_DURATION_SECONDS = SESSION_DURATION_MS / 1000;

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  sales: [
    "customers:read",
    "customers:update",
    "orders:create",
    "orders:confirm",
    "orders:change_prices",
    "orders:cancel",
    "orders:settle",
    "certificates:upload",
    "invoices:register",
    "documents:archive",
    "orders:export"
  ],
  logistics: [
    "customers:read",
    "delivery_tasks:read",
    "delivery_tasks:schedule",
    "delivery_tasks:confirm_shipment",
    "delivery_tasks:confirm_delivery",
    "delivery_tasks:flag_sales_action",
    "inventory:read"
  ],
  manager: [
    "customers:read",
    "customers:update",
    "orders:create",
    "orders:confirm",
    "orders:change_prices",
    "orders:cancel",
    "orders:settle",
    "certificates:upload",
    "invoices:register",
    "documents:archive",
    "orders:export",
    "delivery_tasks:read",
    "delivery_tasks:schedule",
    "delivery_tasks:confirm_shipment",
    "delivery_tasks:confirm_delivery",
    "delivery_tasks:flag_sales_action",
    "inventory:read",
    "price_rules:create",
    "strains:create",
    "inventory_batches:create",
    "audit_logs:read"
  ]
};

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  data: {
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: number;
    user: {
      id: string;
      displayName: string;
      role: UserRole;
    };
  };
}

export interface CurrentUserResult {
  data: {
    id: string;
    displayName: string;
    role: UserRole;
    permissions: string[];
  };
}

export interface AuthApplicationServiceDependencies {
  users: UserRepository;
  sessions: SessionRepository;
}

export class AuthApplicationService {
  constructor(private readonly deps: AuthApplicationServiceDependencies) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.deps.users.findByUsername(input.username);
    if (!user || !user.isActive || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedError();
    }

    const token = generateSessionToken();
    await this.deps.sessions.create({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS)
    });

    return {
      data: {
        accessToken: token,
        tokenType: "Bearer",
        expiresIn: SESSION_DURATION_SECONDS,
        user: { id: user.id, displayName: user.displayName, role: user.role }
      }
    };
  }

  async getCurrentUser(accessToken: string): Promise<CurrentUserResult> {
    const session = await this.deps.sessions.findByTokenHash(hashSessionToken(accessToken));
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError();
    }

    const user = await this.deps.users.findById(session.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError();
    }

    return {
      data: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        permissions: ROLE_PERMISSIONS[user.role]
      }
    };
  }
}
