import { loadOrSpeed } from "@/lib/racing/or-speed-forward";
import { OrSpeedSummary } from "../or-speed/or-speed-summary";

export async function OrSpeedMonitoring() {
  return <OrSpeedSummary data={await loadOrSpeed()} />;
}
