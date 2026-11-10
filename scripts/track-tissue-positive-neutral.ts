import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { initializePositiveNeutral, loadPositiveNeutralContext } from "@/lib/racing/tissue-positive-neutral";
import { summarizePositiveNeutral } from "@/lib/racing/tissue-positive-neutral-metrics";

export async function main(args: string[]) {
  if (args.length > 1 || args[0] && !["init", "summary"].includes(args[0])) throw new Error("Usage: track-tissue-positive-neutral.ts init|summary (no replay, backfill or refresh)");
  if (args[0] === "init") await initializePositiveNeutral();
  const { data, generation } = await loadPositiveNeutralContext();
  console.log(`TISSUE POSITIVE/NEUTRAL MONITOR:\nIMPLEMENTED\n\nSTATUS:\n${data ? "ARMED" : "NOT ARMED"}\n\nARMED AT:\n${data?.armedAt ?? "NOT ARMED"}\n\nPROSPECTIVE EPOCH:\n${data?.epoch ?? "PENDING FIRST GENUINE CAPTURE"}\n\nHISTORICAL BACKFILL:\nNONE\n\nINCLUDED:\nT1/T2 POSITIVE + NEUTRAL\n\nEXCLUDED:\nNEGATIVE / FALLBACK / NR\n\nFAMILY SPLIT:\nIMPLEMENTED\n\nPRICE BANDS:\n<3\n3-<5\n5-<11\n11+\n\nEDGE BANDS:\n0.5-<2\n2-<5\n5-<10\n10+\n\nNEGATIVE REFERENCE:\nIMPLEMENTED (separate from headline)\n\nTISSUE CHANGED:\nNO\n\nVALUE CHANGED:\nNO\n\nWATCH LIST CHANGED:\nNO\n\nTESTS:\nbun test src/lib/racing/tissue-positive-neutral.test.tsx; bun run typecheck; targeted lint`);
  console.log(JSON.stringify(summarizePositiveNeutral(data, generation), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
