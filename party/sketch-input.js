export class SketchStrokeBuffer {
  constructor() { this.points = []; }
  begin(point) { this.points = [point]; }
  get last() { return this.points[this.points.length - 1] || null; }
  get length() { return this.points.length; }
  add(point) { this.points.push(point); }
  drain({ keepTail = true } = {}) {
    if (this.points.length < 2) return [];
    const batch = this.points.slice();
    this.points = keepTail ? [batch[batch.length - 1]] : [];
    return batch;
  }
  clear() { this.points = []; }
}
