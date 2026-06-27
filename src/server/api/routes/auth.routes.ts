import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../app-dependencies.js";
import { requireAuth } from "../plugins/auth.js";
import { loginSchema } from "../schemas/login.schema.js";
import { dataResponse } from "../../shared/api-response.js";
import { validateBody } from "../validate.js";

export function registerAuthRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = validateBody(loginSchema, request.body);
    const result = await deps.auth.login(body);
    reply.send(
      dataResponse({
        access_token: result.data.accessToken,
        token_type: result.data.tokenType,
        expires_in: result.data.expiresIn,
        user: {
          id: result.data.user.id,
          display_name: result.data.user.displayName,
          role: result.data.user.role
        }
      })
    );
  });

  app.get("/api/v1/me", { preHandler: requireAuth(deps.auth) }, async (request, reply) => {
    reply.send(
      dataResponse({
        id: request.user!.id,
        display_name: request.user!.displayName,
        role: request.user!.role,
        permissions: request.user!.permissions
      })
    );
  });
}
