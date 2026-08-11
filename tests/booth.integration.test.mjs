import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const boothHandler = require("../api/booth.js");
const { ALLOWED_SPEAKERS, DEFAULT_VOICES, MAX_TEXT } = require("../api/booth/_tts.js");

function mockRequest(url, { method = "GET", body = null } = {}) {
  const chunks = body == null ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = body == null ? {} : { "content-type": "application/json" };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    end(body) {
      this.body = body || "";
      this.ended = true;
    },
  };
}

test("booth cast defaults lock Adam / Brian / Eric voice IDs", () => {
  assert.equal(DEFAULT_VOICES.announcer, "pNInz6obpgDQGcFmaJgB");
  assert.equal(DEFAULT_VOICES.color, "nPczCjzI2devNBz1zQrb");
  assert.equal(DEFAULT_VOICES.utility, "cjVigY5qzO86Huf0OWal");
  assert.ok(ALLOWED_SPEAKERS.has("announcer"));
  assert.ok(ALLOWED_SPEAKERS.has("color"));
  assert.ok(ALLOWED_SPEAKERS.has("utility"));
  assert.equal(MAX_TEXT, 360);
});

test("booth health reports configured=false without API key", async () => {
  const prev = process.env.ELEVENLABS_API_KEY;
  const prevAlt = process.env.ELEVEN_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVEN_API_KEY;
  try {
    const res = mockResponse();
    await boothHandler(mockRequest("/api/booth?route=health"), res);
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(String(res.body));
    assert.equal(json.ok, false);
    assert.equal(json.cast.announcer, "Adam");
    assert.equal(json.cast.color, "Brian");
    assert.equal(json.cast.utility, "Eric");
  } finally {
    if (prev !== undefined) process.env.ELEVENLABS_API_KEY = prev;
    else delete process.env.ELEVENLABS_API_KEY;
    if (prevAlt !== undefined) process.env.ELEVEN_API_KEY = prevAlt;
    else delete process.env.ELEVEN_API_KEY;
  }
});

test("booth tts rejects missing key with 503", async () => {
  const prev = process.env.ELEVENLABS_API_KEY;
  const prevAlt = process.env.ELEVEN_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVEN_API_KEY;
  try {
    const res = mockResponse();
    await boothHandler(
      mockRequest("/api/booth?route=tts", {
        method: "POST",
        body: { text: "Rivera CRUSHES one to deep left!", speaker: "announcer", tone: "hot" },
      }),
      res,
    );
    assert.equal(res.statusCode, 503);
  } finally {
    if (prev !== undefined) process.env.ELEVENLABS_API_KEY = prev;
    else delete process.env.ELEVENLABS_API_KEY;
    if (prevAlt !== undefined) process.env.ELEVEN_API_KEY = prevAlt;
    else delete process.env.ELEVEN_API_KEY;
  }
});

test("booth tts validates speaker and text length", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key-not-used";
  try {
    const badSpeaker = mockResponse();
    await boothHandler(
      mockRequest("/api/booth?route=tts", {
        method: "POST",
        body: { text: "Hello", speaker: "umpire" },
      }),
      badSpeaker,
    );
    assert.equal(badSpeaker.statusCode, 400);

    const tooLong = mockResponse();
    await boothHandler(
      mockRequest("/api/booth?route=tts", {
        method: "POST",
        body: { text: "x".repeat(MAX_TEXT + 1), speaker: "announcer" },
      }),
      tooLong,
    );
    assert.equal(tooLong.statusCode, 400);
  } finally {
    delete process.env.ELEVENLABS_API_KEY;
  }
});

test("booth unknown route is 404", async () => {
  const res = mockResponse();
  await boothHandler(mockRequest("/api/booth?route=nope"), res);
  assert.equal(res.statusCode, 404);
});
