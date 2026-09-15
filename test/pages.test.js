const test = require('node:test');
const assert = require('node:assert/strict');
const { createPageStack, hashFrame, MAX_PAGES } = require('../src/pages');

const url = (n) => `data:image/png;base64,FRAME${n}`;

test('MAX_PAGES is 6', () => {
  assert.equal(MAX_PAGES, 6);
});

test('adds frames in order and reports the running count', () => {
  const s = createPageStack();
  assert.deepEqual(s.add(url(1)), { ok: true, count: 1 });
  assert.deepEqual(s.add(url(2)), { ok: true, count: 2 });
  assert.equal(s.count(), 2);
  assert.deepEqual(s.list(), [url(1), url(2)]);
});

test('refuses a frame identical to the one before it', () => {
  const s = createPageStack();
  s.add(url(1));
  const res = s.add(url(1));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'duplicate');
  assert.equal(s.count(), 1, 'duplicate must not be stored');
});

test('allows a repeat that is not consecutive (scrolling back up)', () => {
  const s = createPageStack();
  s.add(url(1));
  s.add(url(2));
  assert.equal(s.add(url(1)).ok, true);
  assert.equal(s.count(), 3);
});

test('refuses past the cap instead of dropping a frame', () => {
  const s = createPageStack();
  for (let i = 1; i <= MAX_PAGES; i++) assert.equal(s.add(url(i)).ok, true);
  const res = s.add(url(99));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'full');
  assert.equal(s.count(), MAX_PAGES);
  assert.equal(s.list()[0], url(1), 'oldest frame must survive');
});

test('refuses an empty capture', () => {
  const s = createPageStack();
  assert.deepEqual(s.add(null), { ok: false, reason: 'empty', count: 0 });
});

test('clear empties the stack', () => {
  const s = createPageStack();
  s.add(url(1));
  s.clear();
  assert.equal(s.count(), 0);
  assert.deepEqual(s.list(), []);
});

test('list returns a copy, not the internal array', () => {
  const s = createPageStack();
  s.add(url(1));
  s.list().push(url(2));
  assert.equal(s.count(), 1);
});

test('hashFrame is stable and distinguishes different frames', () => {
  assert.equal(hashFrame(url(1)), hashFrame(url(1)));
  assert.notEqual(hashFrame(url(1)), hashFrame(url(2)));
});

test('drop removes only the first n frames, leaving the remainder in order', () => {
  const s = createPageStack();
  s.add(url(1)); s.add(url(2)); s.add(url(3));
  const remaining = s.drop(2);
  assert.equal(remaining, 1);
  assert.equal(s.count(), 1);
  assert.deepEqual(s.list(), [url(3)]);
});

test('drop of the full count empties the stack', () => {
  const s = createPageStack();
  s.add(url(1)); s.add(url(2));
  const remaining = s.drop(2);
  assert.equal(remaining, 0);
  assert.equal(s.count(), 0);
  assert.deepEqual(s.list(), []);
});

test('drop clamps past the stack size instead of throwing', () => {
  const s = createPageStack();
  s.add(url(1)); s.add(url(2));
  const remaining = s.drop(99);
  assert.equal(remaining, 0);
  assert.equal(s.count(), 0);
  assert.deepEqual(s.list(), []);
});

test('drop(0) is a no-op', () => {
  const s = createPageStack();
  s.add(url(1)); s.add(url(2));
  const remaining = s.drop(0);
  assert.equal(remaining, 2);
  assert.equal(s.count(), 2);
  assert.deepEqual(s.list(), [url(1), url(2)]);
});
