import { loadOrSpeed } from "@/lib/racing/or-speed-forward";
import { OrSpeedSummary } from "./or-speed-summary";

export const dynamic = "force-dynamic";

export default async function OrSpeedPage() { return <OrSpeedSummary data={await loadOrSpeed()} />; }
