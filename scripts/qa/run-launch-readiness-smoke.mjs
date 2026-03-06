import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const baseUrl = "http://127.0.0.1:4173";

function pickPythonCommand() {
  const candidates = process.platform === "win32"
    ? ["python", "py"]
    : ["python3", "python"];

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  throw new Error("Python is required to run local smoke tests (python3/python not found).");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Smoke script exited with code ${code}`));
    });
  });
}

async function main() {
  const pythonCmd = pickPythonCommand();
  const server = spawn(pythonCmd, ["-m", "http.server", "4173"], {
    cwd: repoRoot,
    stdio: "ignore",
    detached: false,
  });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (!server.killed) {
      server.kill("SIGTERM");
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    await sleep(1500);
    await runNodeScript(path.join(repoRoot, "scripts", "qa", "launch-readiness-smoke.mjs"), [baseUrl]);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
