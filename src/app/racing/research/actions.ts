"use server";

import { revalidatePath } from "next/cache";
import {
  parseResearchRule,
  type ResearchRuleV1,
} from "@/lib/racing/research-rule";
import {
  deleteSavedResearchRule,
  freezeSavedResearchRule,
  saveFrozenResearchRuleSnapshot,
  type DevelopmentResultSnapshot,
  type ResearchRuleCacheMetadata,
} from "@/lib/racing/saved-research-rules";

export async function saveResearchRuleAction(formData: FormData) {
  const rule = requiredResearchRule(formData.get("rule"));
  await saveFrozenResearchRuleSnapshot({
    name: requiredText(formData.get("name"), "Rule name"),
    notes: optionalText(formData.get("notes")),
    rule,
    developmentSnapshot: requiredJson<DevelopmentResultSnapshot>(
      formData.get("developmentSnapshot"),
      "development result snapshot",
    ),
    cacheMetadata: optionalJson<ResearchRuleCacheMetadata>(formData.get("cacheMetadata")),
  });
  revalidatePath("/racing/research");
}

export async function freezeSavedResearchRuleAction(formData: FormData) {
  await freezeSavedResearchRule(requiredText(formData.get("id"), "Saved rule ID"));
  revalidatePath("/racing/research");
}

export async function deleteSavedResearchRuleAction(formData: FormData) {
  await deleteSavedResearchRule(requiredText(formData.get("id"), "Saved rule ID"), {
    confirmFrozenDelete: formData.get("confirmFrozenDelete") === "yes",
  });
  revalidatePath("/racing/research");
}

function requiredResearchRule(value: FormDataEntryValue | null): ResearchRuleV1 {
  const text = requiredText(value, "Research rule");
  const rule = parseResearchRule(text);
  if (!rule) {
    throw new Error("Research rule is invalid");
  }
  return rule;
}

function requiredJson<T>(value: FormDataEntryValue | null, label: string): T {
  const text = requiredText(value, label);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} is invalid`);
  }
}

function optionalJson<T>(value: FormDataEntryValue | null): T | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return JSON.parse(value) as T;
}

function requiredText(value: FormDataEntryValue | null, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}
