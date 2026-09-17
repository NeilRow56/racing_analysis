import { spawn } from "node:child_process";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createBackup, verifyBackup } from "./backup-project";

async function createWeeklyBackup() {
  const backupDirectory = await createBackup();
  await verifyBackup(backupDirectory);

  const documentsDirectory = join(homedir(), "Documents");
  await mkdir(documentsDirectory, { recursive: true });
  const archiveName = `racing-analysis-weekly-${basename(backupDirectory)}.tar.gz`;
  const archivePath = join(documentsDirectory, archiveName);
  const stagingPath = `${archivePath}.incomplete-${process.pid}`;
  await assertMissing(archivePath);

  try {
    await runCommand("tar", [
      "-czf",
      stagingPath,
      "-C",
      dirname(backupDirectory),
      basename(backupDirectory),
    ]);
    await assertNonEmptyFile(stagingPath);
    const listing = await commandOutput("tar", ["-tzf", stagingPath]);
    const root = `${basename(backupDirectory)}/`;
    for (const required of ["postgres.dump", "tpr-vs-timewise-forward.json", "manifest.json"]) {
      if (!listing.split("\n").includes(`${root}${required}`)) {
        throw new Error(`Weekly archive is missing ${required}`);
      }
    }
    await rename(stagingPath, archivePath);
    console.log(`Weekly backup archive verified: ${archivePath}`);
  } catch (error) {
    await rm(stagingPath, { force: true });
    throw error;
  }
}

async function assertNonEmptyFile(path: string) {
  const details = await stat(path);
  if (!details.isFile() || details.size === 0) throw new Error(`Weekly archive is missing or empty: ${path}`);
}

async function assertMissing(path: string) {
  try {
    await stat(path);
    throw new Error(`Refusing to overwrite existing weekly archive: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function runCommand(command: string, args: string[]) {
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "inherit"] });
    child.once("error", reject);
    child.once("close", (code: number | null) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`${command} failed with exit code ${exitCode}`);
}

async function commandOutput(command: string, args: string[]) {
  return new Promise<string>((resolveOutput, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`${command} failed with exit code ${code ?? 1}`));
      else resolveOutput(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await createWeeklyBackup();
