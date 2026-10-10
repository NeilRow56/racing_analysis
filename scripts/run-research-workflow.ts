import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

type WorkflowMode = "night" | "morning" | "live" | "late" | "after";

type WorkflowStep = {
  label: string;
  script: string;
  args?: string[];
};

type ChildRunner = (step: WorkflowStep) => Promise<number>;

type WorkflowFailure = {
  step: WorkflowStep;
  exitCode: number;
};

type WorkflowResult = {
  exitCode: number;
  failed?: WorkflowFailure;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(args: string[], now = new Date()): { mode: WorkflowMode; date: string } {
  const modeIndex = args.indexOf("--mode");
  const modeValue = modeIndex >= 0 ? args[modeIndex + 1] : undefined;

  if (modeIndex < 0 || modeValue === undefined) {
    throw new Error("Usage: run-research-workflow.ts --mode <night|morning|live|late|after> [YYYY-MM-DD]");
  }
  if (modeValue !== "night" && modeValue !== "morning" && modeValue !== "live" && modeValue !== "late" && modeValue !== "after") {
    throw new Error(`Invalid mode "${modeValue}". Use "night", "morning", "live", "late", or "after".`);
  }

  const positional = args.filter((_, index) => index !== modeIndex && index !== modeIndex + 1);
  if (positional.length > 1) {
    throw new Error("Usage: run-research-workflow.ts --mode <night|morning|live|late|after> [YYYY-MM-DD]");
  }

  const date = positional[0] ??
    (modeValue === "night" ? nextLocalDateString(now) :
      modeValue === "after" ? previousLocalDateString(now) :
        localDateString(now));
  if (!isValidDate(date)) {
    throw new Error(`Invalid date "${date}". Use YYYY-MM-DD.`);
  }

  return { mode: modeValue, date };
}

export function workflowSteps(mode: WorkflowMode, date: string): WorkflowStep[] {
  if (mode === "night") {
    return [
      { label: "Importing first next-day racecards", script: "sl:import-racecards", args: [date, "--request-delay-seconds", "2", "--skip-existing-racecards"] },
      { label: "Model disagreement first next-day sync", script: "disagreement:night", args: [date] },
    ];
  }
  if (mode === "late") {
    return [
      { label: "Refreshing racecards/prices", script: "sl:import-racecards", args: [date, "--request-delay-seconds", "2"] },
      { label: "Model disagreement late-morning sync", script: "disagreement:late", args: [date] },
    ];
  }
  if (mode === "live") {
    return [
      { label: "Importing in-progress results", script: "sl:import-day", args: [date, "--request-delay-seconds", "2"] },
      { label: "Settling existing prospective trackers", script: "research:settle", args: [date] },
      { label: "Tissue VALUE live summary", script: "value:today", args: [date] },
      { label: "Jump G4 shadow status", script: "jump-g4:today", args: [date] },
      { label: "Today's Rating weight shadow status", script: "todays-rating-weight:today", args: [date] },
      { label: "AW paired research summary", script: "aw-pair:compact", args: [date] },
      { label: "AW Turf-architecture challenger", script: "aw-pair:challenger", args: [date] },
    ];
  }
  if (mode === "after") {
    return [
      { label: "Importing complete results", script: "sl:import-day", args: [date, "--request-delay-seconds", "2"] },
      { label: "Settling existing prospective trackers", script: "research:settle", args: [date] },
      { label: "Completed Tissue VALUE results", script: "value:results", args: [date] },
      { label: "AW paired research results", script: "aw-pair:results", args: [date] },
      { label: "AW Turf-architecture challenger results", script: "aw-pair:challenger", args: [date] },
    ];
  }
  const importStep: WorkflowStep = mode === "morning"
    ? {
        label: "Importing racecards",
        script: "sl:import-racecards",
        args: [date, "--request-delay-seconds", "2"],
      }
    : {
        label: "Importing results",
        script: "sl:import-day",
        args: [date, "--request-delay-seconds", "2"],
      };

  const steps = [
    importStep,
    { label: "TPR sync", script: "tpr:sync", args: [date] },
    { label: "Tissue sync", script: "tissue:sync", args: [date] },
    { label: "Today's Rating weight shadow sync", script: "todays-rating-weight:sync", args: [date] },
    { label: "Jump rating sync", script: "jump-rating:sync", args: [date] },
    { label: "Jump tissue sync", script: "jump-tissue:sync", args: [date] },
    { label: "Jump G4 sync", script: "jump-g4:sync", args: [date] },
    { label: "AW rating sync", script: "aw-rating:sync", args: [date] },
    { label: "AW tissue sync", script: "aw-tissue:sync", args: [date] },
    { label: "AW paired Tissue research sync", script: "aw-pair:sync", args: [date] },
    { label: "AW shadow sync", script: "sync:aw-shadow", args: [date] },
  ];
  return [...steps, { label: "Model disagreement morning sync", script: "disagreement:morning", args: [date] }, { label: "Tissue VALUE morning summary", script: "value:today", args: [date] }, { label: "AW Turf-architecture challenger", script: "aw-pair:challenger", args: [date] }];
}

export async function runWorkflow(
  options: { mode: WorkflowMode; date: string },
  runner: ChildRunner = runBunScript,
): Promise<WorkflowResult> {
  const steps = workflowSteps(options.mode, options.date);

  console.log(`Research ${options.mode} - ${options.date}`);
  console.log();

  for (const [index, step] of steps.entries()) {
    console.log(`[${index + 1}/${steps.length}] ${step.label}...`);
    const exitCode = await runner(step);
    if (exitCode !== 0) {
      console.error(`Step failed: ${step.label} (${step.script}) exited with code ${exitCode}`);
      return { exitCode, failed: { step, exitCode } };
    }
    console.log("complete");
    console.log();
  }

  console.log(`Research ${options.mode} complete.`);
  return { exitCode: 0 };
}

export function runBunScript(step: WorkflowStep) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("bun", ["run", step.script, ...(step.args ?? [])], {
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

export function localDateString(date: Date) {
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

export function nextLocalDateString(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return localDateString(next);
}

export function previousLocalDateString(date: Date) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return localDateString(previous);
}

export function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
}

export async function main(args: string[]) {
  try {
    const parsed = parseArgs(args);
    const result = await runWorkflow(parsed);
    return result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));
