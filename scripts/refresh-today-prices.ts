import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Standalone entry point: package.json belongs to the frozen collection source graph.
export async function main(args: string[]) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) {
    throw new Error("Usage: bun run scripts/refresh-today-prices.ts [--dry-run]");
  }
  const root = resolve(import.meta.dirname, "..");
  await new Promise<void>((done, reject) => {
    const child = spawn(resolve(root, "scraper/.venv/bin/python"),
      [resolve(root, "scraper/scripts/refresh_today_prices.py"), ...args],
      { cwd: root, stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("close", code => code === 0 ? done() : reject(new Error(`Prices-only refresh failed (${code})`)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
