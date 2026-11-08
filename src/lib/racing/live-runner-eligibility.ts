/** Live eligibility is independent of immutable capture-time ranks and prices. */
export function isLiveRunnerEligible(runner?: { resultStatus?: string | null } | null): boolean {
  return runner?.resultStatus !== "non_runner";
}
