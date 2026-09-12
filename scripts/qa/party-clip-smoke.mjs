import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.addInitScript(() => {
  HTMLCanvasElement.prototype.captureStream = () => ({ getTracks: () => [{ stop() {} }] });
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = "inactive"; this.ondataavailable = null; this.onstop = null; }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["party clip"], { type: "video/webm" }) });
      this.onstop?.();
    }
  }
  window.MediaRecorder = FakeMediaRecorder;
});
await page.goto(`${baseUrl}/turbotilt/?embedded=1`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#cadeClipControl");
const snapshot = (phase, partyPhase) => ({ gameKey: "turbotilt", partyPhase, phase, phaseEndsAt: Date.now() + 45000, players: [] });
await page.evaluate((state) => window.postMessage({ type: "party_snapshot", roomId: "ABCD", snapshot: state }, location.origin), snapshot("countdown", "activity"));
await page.waitForFunction(() => document.querySelector("#cadeClipControl")?.dataset.state === "recording");
assert.equal(await page.locator("#cadeClipControl").textContent(), "Save clip");
await page.evaluate((state) => window.postMessage({ type: "party_snapshot", roomId: "ABCD", snapshot: state }, location.origin), snapshot("podium", "results"));
await page.waitForFunction(() => document.querySelector("#cadeClipControl")?.dataset.state === "ready");
await page.click("#cadeClipControl");
await page.waitForFunction(() => document.querySelector("#cadeClipControl")?.textContent === "Clip saved!");
console.log(JSON.stringify({ checks: ["embedded_recording_started", "activity_recording_finalized", "clip_saved"] }));
await browser.close();
