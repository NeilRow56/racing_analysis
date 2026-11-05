import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getLocalRacingDate } from "@/lib/racing/todays-racing";
import { TISSUE_GENERATION, tissueGenerationActive } from "@/lib/racing/tissue-generation-config";
import { GENERATION_MODEL_VERSIONS } from "@/lib/racing/tissue-generation-model";
import { loadTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { latestPreOffCaptures } from "@/lib/racing/frozen-capture-selection";

export type RefreshRunner = (script: string, args: string[], env?: Record<string, string>) => Promise<string>;
export async function refreshTodayRacecards(date = getLocalRacingDate(), run: RefreshRunner = runScript, now = new Date()) {
  if (date !== getLocalRacingDate(now) || !tissueGenerationActive(now)) throw new Error("Refresh requires TODAY after the model activation epoch; no backfill.");
  // A failed/partial source import must not fall back to recapturing stored morning prices.
  const output = await run("sl:import-racecards", [date, "--force-refresh"]);
  const ids = [...output.matchAll(/^RACECARD_IMPORTED .*race_id=(\S+) runners=/gm)].map(m => m[1]);
  const env = { RESEARCH_REFRESH_SOURCE_IDS: ids.join(",") };
  if (ids.length) {
    await run("tissue-value:sync", [date, "--force-refresh"], env);
    await run("tissue-generation:sync", [date, "--force-refresh"], env);
  }
  return { refreshed: ids.length, preservedOff: Number(output.match(/^ALREADY_OFF_RACES_PRESERVED=(\d+)/m)?.[1] ?? 0) };
}
async function runScript(script: string, args: string[], env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", script, ...args], { env: { ...process.env, ...env }, stdio: ["inherit", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += String(chunk); process.stdout.write(chunk); });
    child.stderr.on("data", chunk => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve(output) : reject(new Error(`${script} failed (${code}); refresh incomplete.`)));
  });
}
export async function main(args: string[]) {
  if (args.length > 1) throw new Error("Usage: bun run today:refresh [YYYY-MM-DD]");
  const date = args[0] ?? getLocalRacingDate();
  const summary = await refreshTodayRacecards(date);
  const captures = latestPreOffCaptures((await loadTissueGeneration()).races.filter(r => r.raceDate === date));
  const latest = captures.map(r => r.capturedAt).sort().at(-1);
  console.log(`Today's racecards refreshed\nFuture racecards refreshed: ${summary.refreshed}\nAlready-off races preserved: ${summary.preservedOff}\nLatest valid Tissue capture (London): ${latest ? new Date(latest).toLocaleString("en-GB", { timeZone: "Europe/London" }) : "none"}\n${TISSUE_GENERATION}\n${Object.values(GENERATION_MODEL_VERSIONS).join(" · ")}\nVALUE_RANK_V2\nUnchanged source/model state is idempotent. Capture requires a valid pre-off field; see sync output.\nNO HISTORICAL BACKFILL OR REWRITE.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
