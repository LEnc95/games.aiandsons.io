import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const baseUrl = "http://127.0.0.1:4173";

function staticServerCommand() {
  return {
    command: process.execPath,
    args: [path.join(repoRoot, "scripts", "qa", "static-server.mjs"), repoRoot, "4173"],
  };
}

async function waitFor(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stop(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === "win32" && proc.pid) {
    spawnSync("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    proc.kill("SIGTERM");
  }
}

async function main() {
  const webCommand = staticServerCommand();
  const web = spawn(webCommand.command, webCommand.args, { cwd: repoRoot, stdio: "ignore" });
  const multiplayer = spawn("go", ["run", "."], {
    cwd: path.join(repoRoot, "v2-server"),
    stdio: "ignore",
    env: { ...process.env, PORT: "8081", PARTY_TEST_FAST: "1" },
  });
  const cleanup = () => { stop(web); stop(multiplayer); };
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  process.on("SIGTERM", () => { cleanup(); process.exit(143); });
  try {
    await Promise.all([waitFor(`${baseUrl}/party/`), waitFor("http://127.0.0.1:8081/healthz")]);
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(repoRoot, "scripts", "qa", "turbotilt-smoke.mjs"), baseUrl], { cwd: repoRoot, stdio: "inherit" });
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Turbo Tilt smoke exited with ${code}`)));
    });
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
