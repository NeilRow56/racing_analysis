import { readFile } from "node:fs/promises";
import { developmentReports, trainerTargetingReportId } from "../../development-reports";

export async function GET(_request: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const source = report === trainerTargetingReportId ? report : developmentReports.find(([id]) => id === report)?.[0];
  if (!source) return new Response("Report not found.", { status: 404 });
  const content = await readFile(`docs/${source}.md`, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (content === null) return new Response("Report unavailable.", { status: 404 });
  return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
