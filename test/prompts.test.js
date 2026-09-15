const test = require('node:test');
const assert = require('node:assert/strict');
const { MODES } = require('../src/prompts');

test('assist mode gives a direct answer in first person', () => {
  const system = MODES.assist.buildSystem(null);
  const text = system + '\n' + MODES.assist.build({ transcript: [], userText: '' });
  // System prompt must instruct to answer in first person with no preamble
  assert.match(text, /first person/i);
  assert.match(text, /no preamble|preamble/i);
});

test('say mode produces a spoken answer not a question', () => {
  const system = MODES.say.buildSystem(null);
  const text = system + '\n' + MODES.say.build({ transcript: [], userText: '' });
  assert.match(text, /say out loud|in first person/i);
  // Must instruct to write actual spoken words (not meta-instructions)
  assert.match(text, /actual words|Write the|2.5 sentences/i);
});

test('leetcode mode ignores context block and returns coding prompt', () => {
  const system = MODES.leetcode.buildSystem('IGNORED_CONTEXT');
  assert.match(system, /competitive programmer|coding problem/i);
  assert.ok(!system.includes('IGNORED_CONTEXT'), 'leetcode should not include context block');
});

test('followup mode returns a bullet list', () => {
  const system = MODES.followup.buildSystem(null);
  assert.match(system, /bullet list|bullets/i);
});

test('all modes have a build function', () => {
  for (const [name, mode] of Object.entries(MODES)) {
    assert.equal(typeof mode.build, 'function', `${name}.build must be a function`);
    assert.equal(typeof mode.buildSystem, 'function', `${name}.buildSystem must be a function`);
  }
});

test('leetcode mode tells the model multiple images are ONE problem', () => {
  const system = MODES.leetcode.buildSystem(null);
  assert.match(system, /same problem|one problem|single problem/i);
  assert.match(system, /top[- ]to[- ]bottom|consecutive|in order/i);
  assert.match(system, /overlap/i);
});

test('leetcode user turn does not claim there is exactly one screenshot', () => {
  const user = MODES.leetcode.build({ transcript: [], userText: '' });
  assert.doesNotMatch(user, /\bthe screenshot\b/i, 'singular "the screenshot" contradicts a multi-page send');
});

test('leetcode still falls back to C++', () => {
  const system = MODES.leetcode.buildSystem(null);
  assert.match(system, /else C\+\+/);
});
