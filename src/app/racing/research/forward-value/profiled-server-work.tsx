import type { ReactNode } from "react";
import { bindProfileContext, profileStage, profileSync, profilingEnabled } from "@/lib/racing/performance-profile";

/** Return the original element when disabled; capture context for deferred RSC work. */
export function profiledServerWork(label: string, work: () => ReactNode | Promise<ReactNode>, fallback: ReactNode) {
  if (!profilingEnabled()) return fallback;
  const run = bindProfileContext(() => profileStage(label, async () => work()));
  async function ProfiledWork() { return run(); }
  return <ProfiledWork />;
}
export function profiledCalculation<T>(label: string, work: () => T) {
  return profileSync(label, work);
}
