import { describe, expect, it } from "vitest";
import { InMemoryTransactionRunner, PrismaTransactionRunner } from "./transaction-runner.js";

describe("TransactionRunner", () => {
  it("runs in-memory callbacks with the provided context", async () => {
    const runner = new InMemoryTransactionRunner({ value: 2 });

    await expect(runner.run(async (context) => context.value + 3)).resolves.toBe(5);
  });

  it("builds a transaction-scoped context from the Prisma transaction client", async () => {
    const calls: string[] = [];
    const prisma = {
      $transaction: async <T>(callback: (client: { tx: true }) => Promise<T>): Promise<T> => {
        calls.push("transaction");
        return callback({ tx: true });
      }
    };
    const runner = new PrismaTransactionRunner(prisma, (client) => ({ reposUseTransactionClient: client.tx }));

    await expect(runner.run(async (context) => Number(context.reposUseTransactionClient))).resolves.toBe(1);
    expect(calls).toEqual(["transaction"]);
  });
});