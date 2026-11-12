import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// Exact, reviewed v2-feature adapter substitutions only. No settlement implementation
// substitutions are authorised: Shadow and Positive/Neutral retain their blockers.
// Original ledger hashes remain the provenance; unknown drift always fails closed.
const substitutions: Record<string, readonly [string, string]> = {
  "src/lib/racing/hurdle-v3-market-edge.ts": [
    "2b9a8681f36f469f6d29b350132a37b26ca26efbae2602e1359ac1f66237dbb3",
    "004fc189541d6459c43e421cc5a9eacc555b0d2260a8176878fb928f5ac95dc9"
  ],
  "src/lib/racing/turf-early-season.ts": [
    "b804276dda20baa62ef14cd4599ce1f2343937c82d9de86eca03e5cdbfdc47c0",
    "d58c93f61614e2906d66c8f8cf2bfc1dfff759ec19ba8fbd3736bb9d40a215d1"
  ],
  "src/lib/racing/hurdle-v3-challenger-features.ts": [
    "acfc91b8ccab7991868ef1fa3128c5fbd5320b04936c34bd65ddc039ab46b86f",
    "d8285c3f117813b41b191ba06e08f10dfabe99ccffc66884c5a46d074814a858"
  ],
  "src/lib/racing/turf-early-season-inputs.ts": [
    "8084678fd3b79d000f4ef16bb5c0f5ef692e8cc7861b5e35ea1e15f8c008daff",
    "0f87d766700d6175a25727b30fef651292f3f5e6eca47b04ef6884f617b0117a"
  ]
};
const legacyClassifierDependency = "b078ee2c1473903facb2fc9ed6c81424c0bfbc56742091d7f1e25d1c968839f8";
export async function assertCompatibleCapturePins(expected: Record<string, string>, current: Record<string, string>, monitor: "hurdle-v3-market-edge" | "turf-early-season") {
  const permitted = new Set([`src/lib/racing/${monitor}.ts`, monitor === "hurdle-v3-market-edge"
    ? "src/lib/racing/hurdle-v3-challenger-features.ts" : "src/lib/racing/turf-early-season-inputs.ts"]);
  if (Object.keys(expected).length !== Object.keys(current).length) throw new Error(`${monitor} methodology changed; pin set differs`);
  let adapted = false;
  for (const [path, original] of Object.entries(expected)) {
    if (current[path] === original) continue;
    const pair = substitutions[path];
    if (!permitted.has(path) || !pair || original !== pair[0] || current[path] !== pair[1]) throw new Error(`${monitor} methodology changed: ${path}`);
    adapted = true;
  }
  if (adapted && createHash("sha256").update(await readFile("src/lib/racing/backtest.ts")).digest("hex") !== legacyClassifierDependency)
    throw new Error(`${monitor} legacy classifier dependency changed`);
}
