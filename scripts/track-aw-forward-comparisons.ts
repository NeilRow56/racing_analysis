import { loadAwForwardData, renderAwForwardReport } from "@/lib/racing/aw-forward-comparisons";

async function main() {
  const command = process.argv[2] ?? "summary";
  if (command !== "summary") throw new Error("Use: bun run aw:summary");
  console.log(renderAwForwardReport(await loadAwForwardData()));
}

await main();
