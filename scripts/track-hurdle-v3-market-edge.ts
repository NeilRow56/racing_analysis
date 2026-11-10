import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { initializeHurdleMarketEdge, loadHurdleMarketEdgeContext } from "@/lib/racing/hurdle-v3-market-edge";
import { summarizeHurdleMarketEdge } from "@/lib/racing/hurdle-v3-market-edge-metrics";

export async function main(args: string[]) {
  if (args.length > 1 || args[0] && !["init", "summary"].includes(args[0])) throw new Error("Usage: track-hurdle-v3-market-edge.ts init|summary (no replay, backfill or refresh)");
  if (args[0] === "init") await initializeHurdleMarketEdge();
  const { data, shadows } = await loadHurdleMarketEdgeContext();
  console.log(`V3 MARKET-EDGE MONITOR:\nIMPLEMENTED\n\nSTATUS:\n${data ? "ARMED" : "NOT ARMED"}\n\nARMED AT:\n${data?.armedAt ?? "NOT ARMED"}\n\nPROSPECTIVE EPOCH:\n${data?.epoch ?? "PENDING FIRST GENUINE CAPTURE"}\n\nHISTORICAL BACKFILL:\nNONE\n\nEDGE BANDS:\n<0\n0-<5\n5-<10\n>=10 pp\n\nPRIMARY COHORT:\nV3 T1 >=10 pp\n\nSPEED-DEPTH SPLIT:\nIMPLEMENTED\n\nMARKET-RANK SPLIT:\nIMPLEMENTED\n\nTODAY LABEL:\nNOT ADDED; RESEARCH ONLY\n\nRESEARCH SUMMARY:\nT1/T2 bands, large-edge Speed/market-rank/form splits, V2 reference\n\nV3 CHANGED:\nNO\n\nV2 CHANGED:\nNO\n\nVALUE CHANGED:\nNO\n\nTESTS:\nbun test src/lib/racing/hurdle-v3-market-edge.test.tsx; bun run typecheck; targeted lint`);
  console.log(JSON.stringify(summarizeHurdleMarketEdge(data, shadows), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
