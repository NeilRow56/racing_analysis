import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BACKUP_ROOT = resolve("backups");
const TRACKER_PATH = resolve("data/research/tpr-vs-timewise-forward.json");
const DUMP_FILENAME = "postgres.dump";
const TRACKER_FILENAME = "tpr-vs-timewise-forward.json";
const MANIFEST_FILENAME = "manifest.json";
const COMPLETE_BACKUP_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{6}$/;

type BackupManifest = {
  timestamp: string;
  databaseBackup: { filename: string; bytes: number; format: "postgres-custom" };
  tracker: { filename: string; bytes: number };
  gitCommitSha: string | null;
  applicationVersion: string | null;
  latestMigration: string | null;
};

async function createBackup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set. Run through `bun run backup:daily` so .env.local is loaded.");

  await mkdir(BACKUP_ROOT, { recursive: true });
  const timestamp = backupTimestamp(new Date());
  const finalDirectory = join(BACKUP_ROOT, timestamp);
  const stagingDirectory = join(BACKUP_ROOT, `.${timestamp}.incomplete-${process.pid}`);
  const dumpPath = join(stagingDirectory, DUMP_FILENAME);
  const trackerBackupPath = join(stagingDirectory, TRACKER_FILENAME);
  await mkdir(stagingDirectory);

  try {
    await runCommand("pg_dump", ["--format=custom", "--file", dumpPath], {
      ...process.env,
      ...postgresEnvironment(databaseUrl),
      DATABASE_URL: undefined,
    });
    await assertNonEmptyFile(dumpPath, "PostgreSQL dump");
    await verifyPostgresDump(dumpPath);

    JSON.parse(await readFile(TRACKER_PATH, "utf8"));
    await copyFile(TRACKER_PATH, trackerBackupPath);
    await assertNonEmptyFile(trackerBackupPath, "forward tracker backup");
    JSON.parse(await readFile(trackerBackupPath, "utf8"));

    const manifest: BackupManifest = {
      timestamp: new Date().toISOString(),
      databaseBackup: {
        filename: DUMP_FILENAME,
        bytes: (await stat(dumpPath)).size,
        format: "postgres-custom",
      },
      tracker: {
        filename: TRACKER_FILENAME,
        bytes: (await stat(trackerBackupPath)).size,
      },
      gitCommitSha: await commandOutput("git", ["rev-parse", "HEAD"]),
      applicationVersion: await packageVersion(),
      latestMigration: await latestMigration(),
    };
    await writeFile(join(stagingDirectory, MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(stagingDirectory, finalDirectory);
    console.log(`Backup complete: ${finalDirectory}`);
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    console.error("Backup failed; incomplete backup files were removed.");
    throw error;
  }
}

async function verifyLatestBackup() {
  const directories = await completeBackupDirectories();
  const latest = directories.at(-1);
  if (!latest) throw new Error(`No completed backups found in ${BACKUP_ROOT}`);
  const directory = join(BACKUP_ROOT, latest);
  const manifest = JSON.parse(await readFile(join(directory, MANIFEST_FILENAME), "utf8")) as BackupManifest;
  const dumpPath = join(directory, manifest.databaseBackup.filename);
  const trackerPath = join(directory, manifest.tracker.filename);
  await assertNonEmptyFile(dumpPath, "PostgreSQL dump");
  await verifyPostgresDump(dumpPath);
  await assertNonEmptyFile(trackerPath, "forward tracker backup");
  JSON.parse(await readFile(trackerPath, "utf8"));
  console.log(`Backup verified: ${directory}`);
}

async function cleanupBackups(keep: number) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error("--keep must be a positive integer");
  const directories = await completeBackupDirectories();
  const remove = directories.slice(0, Math.max(0, directories.length - keep));
  for (const directory of remove) await rm(join(BACKUP_ROOT, directory), { recursive: true });
  console.log(`Cleanup complete: removed ${remove.length}; retained ${directories.length - remove.length}`);
}

async function completeBackupDirectories() {
  try {
    return (await readdir(BACKUP_ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && COMPLETE_BACKUP_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function verifyPostgresDump(path: string) {
  await runCommand("pg_restore", ["--list", path], process.env);
}

async function assertNonEmptyFile(path: string, label: string) {
  const details = await stat(path);
  if (!details.isFile() || details.size === 0) throw new Error(`${label} is missing or empty: ${path}`);
}

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const processHandle = spawn(command, args, { env, stdio: ["ignore", "ignore", "inherit"] });
    processHandle.once("error", reject);
    processHandle.once("close", (code: number | null) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`${command} failed with exit code ${exitCode}`);
}

async function commandOutput(command: string, args: string[]) {
  return new Promise<string | null>((resolveOutput) => {
    const chunks: Buffer[] = [];
    const processHandle = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    processHandle.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    processHandle.once("error", () => resolveOutput(null));
    processHandle.once("close", (code) => {
      resolveOutput(code === 0 ? Buffer.concat(chunks).toString("utf8").trim() || null : null);
    });
  });
}

async function packageVersion() {
  try {
    return (JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

async function latestMigration() {
  try {
    return (await readdir(resolve("drizzle")))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort()
      .at(-1) ?? null;
  } catch {
    return null;
  }
}

function backupTimestamp(date: Date) {
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}_${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
}

function postgresEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL does not identify a database");
  return {
    NODE_ENV: process.env.NODE_ENV,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
    PGSSLMODE: url.searchParams.get("sslmode") ?? undefined,
  };
}

async function main() {
  const command = process.argv[2] ?? "create";
  if (command === "create") return createBackup();
  if (command === "verify") return verifyLatestBackup();
  if (command === "cleanup") {
    const keepIndex = process.argv.indexOf("--keep");
    return cleanupBackups(Number(keepIndex >= 0 ? process.argv[keepIndex + 1] : "30"));
  }
  throw new Error("Unknown command. Use create, verify, or cleanup.");
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await main();
