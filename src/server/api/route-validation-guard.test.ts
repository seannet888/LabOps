import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("route validation guard", () => {
  it("keeps POST and PATCH route handlers behind validateBody", () => {
    const routesDir = join(process.cwd(), "src/server/api/routes");
    const offenders: string[] = [];

    for (const fileName of readdirSync(routesDir).filter((name) => name.endsWith(".routes.ts"))) {
      const source = readFileSync(join(routesDir, fileName), "utf8");
      const routeStarts = [...source.matchAll(/app\.(post|patch)\(/g)].map((match) => match.index ?? 0);

      for (const [index, start] of routeStarts.entries()) {
        const end = routeStarts[index + 1] ?? source.length;
        const routeBlock = source.slice(start, end);
        if (!routeBlock.includes("validateBody(") && !routeBlock.includes("no-body-command")) {
          offenders.push(`${fileName}:${source.slice(0, start).split("\n").length}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
