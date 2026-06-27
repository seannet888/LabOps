import { createHash } from "node:crypto";

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForHash);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "idempotencyKey")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortForHash(entryValue)])
    );
  }

  return value;
}

export function idempotencyRequestHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortForHash(input))).digest("hex");
}
