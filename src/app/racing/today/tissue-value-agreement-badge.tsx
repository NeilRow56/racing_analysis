import { TISSUE_VALUE_AGREEMENT_TOOLTIP } from "@/lib/racing/tissue-value-agreement";

export function TissueValueAgreementBadge() {
  return <span className="ml-1 inline-flex rounded-sm border border-green-700 bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-950 whitespace-nowrap"
    aria-label="Tissue 1 and Value 1 agreement" title={TISSUE_VALUE_AGREEMENT_TOOLTIP}>T1=V1</span>;
}
