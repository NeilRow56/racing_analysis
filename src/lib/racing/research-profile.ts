/** Opt-in stage timings for the research page and its profiling command. */
export async function researchStage<T>(label: string, work: () => Promise<T>): Promise<T> {
  if (!process.env.RESEARCH_PROFILE) return work();
  const start = performance.now();
  try { return await work(); }
  finally { console.info(`[research] ${label}: ${(performance.now() - start).toFixed(1)}ms`); }
}
