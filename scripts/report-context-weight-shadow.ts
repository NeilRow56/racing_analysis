import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadContextWeightShadow } from "../src/lib/racing/context-weight-shadow-forward";
import { summarizeContextWeightShadow } from "../src/lib/racing/context-weight-shadow-report";
import { loadTissueGeneration } from "../src/lib/racing/tissue-generation-forward";

export async function main(args: string[]) {
  if (args.length > 1) throw new Error("Use report-context-weight-shadow [ledger-path]");
  const source = await loadTissueGeneration().catch((error: unknown) => { console.error("Production coverage unavailable; frozen paired shadow evidence retained", error); return undefined; });
  console.log(JSON.stringify(summarizeContextWeightShadow(await loadContextWeightShadow(args[0]), source), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
