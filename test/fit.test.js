const test = require('node:test');
const assert = require('node:assert/strict');
const { fitImages, totalBytes, PROVIDER_BUDGET_BYTES, LONG_EDGE_STEPS } = require('../src/fit');

// Stand-in for nativeImage: a frame is a string whose length IS its byte size,
// and resizing to long edge E scales that length by (E / 3000).
const frame = (bytes) => 'x'.repeat(bytes);
const fakeResize = (dataUrl, longEdge) => 'x'.repeat(Math.round(dataUrl.length * (longEdge / 3000)));

test('gemini budget is under the documented 20 MB request limit', () => {
  assert.ok(PROVIDER_BUDGET_BYTES.gemini < 20 * 1024 * 1024);
});

test('the smallest downscale step is not below 1600', () => {
  assert.equal(Math.min(...LONG_EDGE_STEPS), 1600);
});

test('images already inside the budget are returned untouched', () => {
  const images = [frame(1000), frame(1000)];
  const r = fitImages(images, { provider: 'gemini', resize: fakeResize, budgetBytes: 10000 });
  assert.deepEqual(r.images, images);
  assert.equal(r.longEdge, null, 'no resize happened');
  assert.equal(r.overBudget, false);
});

test('a single image is never resized when it fits', () => {
  const images = [frame(500)];
  let called = false;
  const spy = (u, e) => { called = true; return fakeResize(u, e); };
  const r = fitImages(images, { provider: 'gemini', resize: spy, budgetBytes: 10000 });
  assert.equal(called, false);
  assert.deepEqual(r.images, images);
});

test('over budget: steps down and stops at the first size that fits', () => {
  const images = [frame(6000), frame(6000)]; // 12000 total
  const r = fitImages(images, { resize: fakeResize, budgetBytes: 11000 });
  // 2560 -> 6000*0.853 = 5120 each = 10240 total, which fits
  assert.equal(r.longEdge, 2560);
  assert.ok(r.bytes <= 11000);
  assert.equal(r.overBudget, false);
});

test('over budget: keeps stepping when the first step is not enough', () => {
  const images = [frame(9000), frame(9000)];
  const r = fitImages(images, { resize: fakeResize, budgetBytes: 10000 });
  assert.ok(r.longEdge < 2560, 'should have gone past the first step');
  assert.ok(r.bytes <= 10000);
});

test('resizes from the ORIGINALS each step, never from an already-shrunk copy', () => {
  const images = [frame(9000)];
  const seen = [];
  const spy = (u, e) => { seen.push(u.length); return fakeResize(u, e); };
  fitImages(images, { resize: spy, budgetBytes: 100 });
  assert.ok(seen.every((len) => len === 9000), `each pass must start from 9000, got ${seen}`);
});

test('still over budget at the floor: flags it instead of sending', () => {
  const images = [frame(50000), frame(50000)];
  const r = fitImages(images, { resize: fakeResize, budgetBytes: 1000 });
  assert.equal(r.overBudget, true);
  assert.equal(r.budget, 1000);
  assert.equal(r.longEdge, 1600);
});

test('an unknown provider gets the safest (smallest) budget', () => {
  const r = fitImages([frame(1)], { provider: 'nope', resize: fakeResize });
  assert.equal(r.overBudget, false);
  assert.equal(totalBytes(r.images), 1);
});

test('totalBytes tolerates nulls', () => {
  assert.equal(totalBytes([frame(10), null, frame(5)]), 15);
});
