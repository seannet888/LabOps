import { existsSync, readFileSync } from "node:fs";
import { buildApp } from "./app.js";
import { getPrismaClient } from "../infrastructure/db/prisma-client.js";
import { buildPrismaAppDependencies } from "../infrastructure/db/prisma-app-dependencies.js";

function loadLocalEnv(): void {
  if (!existsSync(".env")) return;

  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
    process.env[key] ??= value;
  }
}

loadLocalEnv();

const prisma = getPrismaClient();
const app = buildApp(buildPrismaAppDependencies(prisma));
const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? 3000);

async function shutdown(): Promise<void> {
  await app.close();
  await prisma.$disconnect();
}

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

await app.listen({ host, port });
