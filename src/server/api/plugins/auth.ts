import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError, ForbiddenError } from "../../application/errors.js";
import type { AuthApplicationService } from "../../application/auth/login.service.js";
import type { UserRole } from "../../application/shared/types.js";

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  role: UserRole;
  permissions: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export function requireAuth(authService: AuthApplicationService) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }

    const token = header.slice("Bearer ".length);
    const result = await authService.getCurrentUser(token);
    request.user = result.data;
  };
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user || !roles.includes(request.user.role)) {
      throw new ForbiddenError();
    }
  };
}
