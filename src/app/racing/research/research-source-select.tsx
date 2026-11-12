import { JUMP_EXPLORATORY_LABEL, JUMP_EXPLORATORY_SOURCE } from "@/lib/racing/jump-exploratory-research";

export function ResearchSourceSelect({ exploratory = false }: { exploratory?: boolean }) {
  return <label className="mt-4 block text-sm font-medium">Research data source
    <select name="cmpSource" defaultValue={exploratory ? JUMP_EXPLORATORY_SOURCE : "historical"} className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm">
      <option value="historical">Existing historical caches</option>
      <option value={JUMP_EXPLORATORY_SOURCE}>{JUMP_EXPLORATORY_LABEL}</option>
    </select>
  </label>;
}
