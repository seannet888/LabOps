import { readFileSync, existsSync } from "node:fs";

function loadLocalEnv() {
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
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
const isLocalDevHost = url.includes("localhost:55432") || url.includes("127.0.0.1:55432");
if (!isLocalDevHost || !url.includes("lab_mouse_sales_dev")) {
  throw new Error("Refusing to reset a non-local dev database. Expected localhost/127.0.0.1:55432/lab_mouse_sales_dev.");
}

const prisma = new PrismaClient();
const tables = [
  "idempotency_keys",
  "sessions",
  "audit_log",
  "documents",
  "certificates",
  "document_release_reasons",
  "stock_deductions",
  "delivery_tasks",
  "order_status_log",
  "order_items",
  "orders",
  "customer_addresses",
  "customer_contacts",
  "customers",
  "inventory_batches",
  "price_list",
  "strains",
  "species",
  "users"
];

await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`);
await prisma.$disconnect();
console.log("Local dev database reset complete.");
