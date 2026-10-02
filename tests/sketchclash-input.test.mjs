import test from "node:test";
import assert from "node:assert/strict";
import { SketchStrokeBuffer } from "../party/sketch-input.js";

test("continuous Sketch Clash drags retain a connected endpoint across batches", () => {
  const buffer = new SketchStrokeBuffer();
  const batches = [];
  buffer.begin({ x: 0, y: 0, t: 0 });
  for (let index = 1; index <= 100; index += 1) {
    buffer.add({ x: index / 100, y: index / 100, t: index });
    if (buffer.length >= 12) batches.push(buffer.drain());
  }
  batches.push(buffer.drain({ keepTail: false }));

  assert.ok(batches.length > 2, "the gesture should cross multiple network batches");
  for (let index = 1; index < batches.length; index += 1) {
    assert.deepEqual(batches[index][0], batches[index - 1].at(-1), "adjacent batches must share their endpoint");
  }
  assert.deepEqual(batches.at(-1).at(-1), { x: 1, y: 1, t: 100 });
});

test("cancelled or completed strokes clear the retained endpoint", () => {
  const buffer = new SketchStrokeBuffer();
  buffer.begin({ x: 0, y: 0, t: 0 });
  buffer.add({ x: 1, y: 1, t: 1 });
  assert.equal(buffer.drain({ keepTail: false }).length, 2);
  assert.equal(buffer.last, null);
});
