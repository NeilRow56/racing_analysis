import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { initializeLowForm, loadLowFormContext } from "@/lib/racing/hurdle-low-form";
import { summarizeLowForm } from "@/lib/racing/hurdle-low-form-metrics";
export async function main(args: string[]) {
  if (args.length > 1 || args[0] && !["init", "summary"].includes(args[0])) throw new Error("Usage: track-hurdle-low-form.ts init|summary (no backfill or price replacement)");
  if (args[0] === "init") await initializeLowForm();
  const { data, shadows } = await loadLowFormContext();
  console.log(`LOW-FORM MONITOR:\n${data ? "IMPLEMENTED" : "NOT ARMED"}\n\nCLASSIFICATION FROZEN:\n${data ? "YES" : "NO"}\n\nPROSPECTIVE EPOCH:\n${data?.epoch ?? "PENDING FIRST GENUINE LOW-FORM PRE-OFF CAPTURE"}\n\nHISTORICAL BACKFILL:\nNONE\n\nMARKET CAPTURE:\nComplete valid frozen bookmaker median prices only; incomplete markets retained separately\n\nV3 CHANGED:\nNO\n\nV2 CHANGED:\nNO\n\nTODAY LABEL:\nLOW FORM — VERY LOW / LIMITED / MIXED\n\nRESEARCH SUMMARY:\nV3 vs market paired comparison, all-capture V3, secondary V2, monthly breakdown\n\nFIRST OBSERVATIONS:\n${data?.observations.filter(o => o.classification !== "ESTABLISHED FORM").length ?? 0}`);
  console.log(JSON.stringify(summarizeLowForm(data, shadows), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
