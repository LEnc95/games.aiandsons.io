import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const frontendPort = Number(process.env.PARTY_SMOKE_FRONTEND_PORT) || 54173;
const multiplayerPort = Number(process.env.PARTY_SMOKE_MULTIPLAYER_PORT) || 58081;
const staticServer = spawn(process.execPath, [path.join(repoRoot, "scripts", "qa", "static-server.mjs"), repoRoot, String(frontendPort)], { cwd: repoRoot, stdio: "ignore" });
const multiplayer = spawn("go", ["run", "."], { cwd: path.join(repoRoot, "v2-server"), stdio: "ignore", env: { ...process.env, PORT: String(multiplayerPort), PARTY_TEST_FAST: "1", ENABLED_GAMES: "party", SERVICE_NAME: "party-server-test" } });
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
  await Promise.all([waitFor(`http://127.0.0.1:${frontendPort}/party/`), waitFor(`http://127.0.0.1:${multiplayerPort}/healthz/`)]);
  const smoke = spawn(process.execPath, [path.join(repoRoot, "scripts", "qa", "party-rotation-smoke.mjs"), `http://127.0.0.1:${frontendPort}`, `ws://127.0.0.1:${multiplayerPort}/ws`], { cwd: repoRoot, stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => { smoke.on("error", reject); smoke.on("exit", resolve); });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally { cleanup(); }
