import { GENERATION_MODEL_VERSIONS } from "@/lib/racing/tissue-generation-model";
import { TISSUE_VALUE_FAMILIES, type TissueValueFamily } from "@/lib/racing/tissue-value-metrics";

const familyLabels = { TURF: "Turf", AW: "All Weather", HURDLE: "Hurdle", CHASE: "Chase" };

export function TissueFamilyModels({ versions = GENERATION_MODEL_VERSIONS }: {
  versions?: Readonly<Record<TissueValueFamily, string>>;
}) {
  return <p className="mt-1 text-xs text-slate-500">
    Tissue models · {TISSUE_VALUE_FAMILIES.map((family, index) => (
      <span key={family} className="inline-block" title={versions[family]}>
        {index > 0 && " · "}{familyLabels[family]} {versions[family].split("_").at(-1)}
      </span>
    ))}
  </p>;
}
