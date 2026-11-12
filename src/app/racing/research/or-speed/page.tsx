import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OrSpeedPage() {
  redirect("/racing/research/forward-value?monitor=or-speed#or-speed-monitoring");
}
