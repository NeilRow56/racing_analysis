/** Read-only diagnostic entry point. No operational lease, collection, capture or settlement. */
import { renderToReadableStream } from "react-dom/server";
import { profileRequest, profileStage, withReadOnlyDiagnostic } from "../src/lib/racing/performance-profile";

const pageName = process.argv[2];
if (pageName !== "today" && pageName !== "forward-value") throw new Error("Usage: bun --env-file=.env.local scripts/profile-pages.tsx today|forward-value [--archive] [--date=YYYY-MM-DD]");
const date = process.argv.find(arg => arg.startsWith("--date="))?.slice(7);
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Expected --date=YYYY-MM-DD");
// Force every newly created PostgreSQL session read-only, even if the URL had options.
// Never print this URL or underlying database errors.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
let databaseUrl: URL;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) throw new Error("unsupported protocol");
} catch {
  throw new Error("Invalid DATABASE_URL; connection details suppressed");
}
databaseUrl.searchParams.set("options", "-c default_transaction_read_only=on");
process.env.DATABASE_URL = databaseUrl.toString();
process.env.RACING_PROFILE = "1";
try {
  const { default: Page } = pageName === "today"
    ? await import("../src/app/racing/today/page")
    : await import("../src/app/racing/research/forward-value/forward-value-page");
  for (const pass of ["first", "repeat"]) {
    await withReadOnlyDiagnostic(() => profileRequest(`diagnostic.${pageName}.${pass}`, async () => {
      const element = await Page({ searchParams: Promise.resolve({ ...(date ? { date } : {}), ...(process.argv.includes("--archive") ? { archive: "1" } : {}) }) });
      await profileStage("server_render", async () => {
        const stream = await renderToReadableStream(element);
        await stream.allReady;
        await new Response(stream).text();
      });
    }));
  }
} catch {
  console.error("Read-only profiling failed. Consult racing_profile error spans; database details suppressed.");
  process.exitCode = 1;
}
