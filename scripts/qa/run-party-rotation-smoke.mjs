import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const staticServer = spawn(process.platform === "win32" ? "python" : "python3", ["-m", "http.server", "4173"], { cwd: repoRoot, stdio: "ignore" });
const multiplayer = spawn("go", ["run", "."], { cwd: path.join(repoRoot, "v2-server"), stdio: "ignore", env: { ...process.env, PORT: "8081", PARTY_TEST_FAST: "1" } });
const waitFor = async (url) => {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
};
const cleanup = () => { staticServer.kill(); multiplayer.kill(); };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
try {
  await Promise.all([waitFor("http://127.0.0.1:4173/party/"), waitFor("http://127.0.0.1:8081/healthz/")]);
  const smoke = spawn(process.execPath, [path.join(repoRoot, "scripts", "qa", "party-rotation-smoke.mjs"), "http://127.0.0.1:4173", "ws://127.0.0.1:8081/ws"], { cwd: repoRoot, stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => { smoke.on("error", reject); smoke.on("exit", resolve); });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally { cleanup(); }
