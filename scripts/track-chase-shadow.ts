import { loadChaseShadowModel } from "@/lib/racing/chase-shadow-model";
import { loadChaseShadow } from "@/lib/racing/chase-shadow-forward";
import { summarizeChaseShadow } from "@/lib/racing/chase-shadow-summary";

if ((process.argv[2] ?? "summary") !== "summary") throw new Error("Usage: track-chase-shadow.ts summary (capture runs only with normal jump-tissue sync; no backfill)");
await loadChaseShadowModel();
console.log(JSON.stringify(summarizeChaseShadow(await loadChaseShadow()), null, 2));
