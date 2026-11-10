import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { initializeEarlyTurf, loadEarlyTurfContext } from "@/lib/racing/turf-early-season";
import { summarizeEarlyTurf } from "@/lib/racing/turf-early-season-metrics";
export async function main(args: string[]) {
  if (args.length > 1 || args[0] && !["init", "summary"].includes(args[0])) throw new Error("Usage: track-turf-early-season.ts init|summary (no backfill)");
  if (args[0] === "init") await initializeEarlyTurf();
  const { data, generation } = await loadEarlyTurfContext();
  console.log(`2027 TURF MONITOR:\n${data ? "IMPLEMENTED" : "NOT IMPLEMENTED"}\n\nSTATUS:\n${data ? "ARMED" : "NOT ARMED"}\n\nDATE WINDOW:\n1 MARCH 2027 - 31 JULY 2027\n\nPROSPECTIVE EPOCH:\n${data?.epoch ?? "PENDING FIRST GENUINE CAPTURE"}\n\nHISTORICAL BACKFILL:\nNONE\n\nFORM-DEPTH RULES FROZEN:\n${data ? "YES" : "NO"}\n\nMARKET CAPTURE:\nComplete frozen pre-off bookmaker median books; incomplete retained separately; no SP\n\nCURRENT/PRIOR SEASON SPLIT:\nSeasonal Turf evidence and source-attributed Speed/performance; residual context separate\n\nSAME-OR MONITOR:\nRaw feature, contribution, signed T1/T2 gap share (null for tied/absent gap)\n\nMISSINGNESS MONITOR:\nIndicator count, contribution and eight seasonal availability flags\n\nTODAY LABEL:\nEARLY TURF — VERY LOW / LIMITED / MIXED / ESTABLISHED\n\nRESEARCH SUMMARY:\nV4 vs market, all cohorts and March–July, paired comparison and all-capture V4\n\nTURF_V4 CHANGED:\nNO\n\nVALUE CHANGED:\nNO\n\nWATCH LIST CHANGED:\nNO\n\nTESTS:\nbun test src/lib/racing/turf-early-season.test.tsx; bun run typecheck; targeted lint`);
  console.log(JSON.stringify(summarizeEarlyTurf(data, generation), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
