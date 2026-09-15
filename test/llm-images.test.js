const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOpenAIMessages, buildAnthropicMessages, buildGeminiContents } = require('../src/llm');

const IMG1 = 'data:image/png;base64,AAAA';
const IMG2 = 'data:image/png;base64,BBBB';
const IMG3 = 'data:image/png;base64,CCCC';
const TURNS = [{ role: 'user', text: 'Solve the coding problem.' }];

test('openai: one image via the alias keeps the original shape', () => {
  const m = buildOpenAIMessages({ system: 'SYS', turns: TURNS, imageDataUrl: IMG1 });
  assert.deepEqual(m, [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: [
      { type: 'text', text: 'Solve the coding problem.' },
      { type: 'image_url', image_url: { url: IMG1 } }
    ] }
  ]);
});

test('openai: three images become three image_url parts after the text', () => {
  const m = buildOpenAIMessages({ system: 'SYS', turns: TURNS, imageDataUrls: [IMG1, IMG2, IMG3] });
  const content = m[1].content;
  assert.equal(content.length, 4);
  assert.equal(content[0].type, 'text');
  assert.deepEqual(content.slice(1).map((p) => p.image_url.url), [IMG1, IMG2, IMG3]);
});

test('anthropic: one image via the alias keeps the original shape', () => {
  const m = buildAnthropicMessages({ turns: TURNS, imageDataUrl: IMG1 });
  assert.deepEqual(m, [
    { role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: 'Solve the coding problem.' }
    ] }
  ]);
});

test('anthropic: three images come before the text block, in order', () => {
  const m = buildAnthropicMessages({ turns: TURNS, imageDataUrls: [IMG1, IMG2, IMG3] });
  const content = m[0].content;
  assert.equal(content.length, 4);
  assert.deepEqual(content.slice(0, 3).map((b) => b.source.data), ['AAAA', 'BBBB', 'CCCC']);
  assert.equal(content[3].type, 'text');
});

test('gemini: one image via the alias keeps the original shape', () => {
  const c = buildGeminiContents({ turns: TURNS, imageDataUrl: IMG1 });
  assert.deepEqual(c, [
    { role: 'user', parts: [
      { text: 'Solve the coding problem.' },
      { inlineData: { mimeType: 'image/png', data: 'AAAA' } }
    ] }
  ]);
});

test('gemini: three images become three inlineData parts after the text', () => {
  const c = buildGeminiContents({ turns: TURNS, imageDataUrls: [IMG1, IMG2, IMG3] });
  const parts = c[0].parts;
  assert.equal(parts.length, 4);
  assert.equal(parts[0].text, 'Solve the coding problem.');
  assert.deepEqual(parts.slice(1).map((p) => p.inlineData.data), ['AAAA', 'BBBB', 'CCCC']);
});

test('imageDataUrls wins over imageDataUrl when both are given', () => {
  const m = buildOpenAIMessages({ system: 'S', turns: TURNS, imageDataUrl: IMG1, imageDataUrls: [IMG2] });
  assert.deepEqual(m[1].content[1].image_url.url, IMG2);
  assert.equal(m[1].content.length, 2);
});

test('no images leaves every turn as plain text', () => {
  assert.deepEqual(buildOpenAIMessages({ system: 'S', turns: TURNS }), [
    { role: 'system', content: 'S' },
    { role: 'user', content: 'Solve the coding problem.' }
  ]);
  assert.deepEqual(buildAnthropicMessages({ turns: TURNS }), [
    { role: 'user', content: 'Solve the coding problem.' }
  ]);
  assert.deepEqual(buildGeminiContents({ turns: TURNS }), [
    { role: 'user', parts: [{ text: 'Solve the coding problem.' }] }
  ]);
});

test('images attach only to the LAST turn, and only if it is a user turn', () => {
  const turns = [
    { role: 'user', text: 'first' },
    { role: 'assistant', text: 'reply' }
  ];
  const m = buildOpenAIMessages({ system: 'S', turns, imageDataUrls: [IMG1] });
  assert.equal(m[1].content, 'first');
  assert.equal(m[2].content, 'reply');
});

test('an unparseable data url is skipped, not sent as garbage', () => {
  const m = buildAnthropicMessages({ turns: TURNS, imageDataUrls: ['not-a-data-url', IMG1] });
  const content = m[0].content;
  assert.equal(content.length, 2, 'one valid image plus the text block');
  assert.equal(content[0].source.data, 'AAAA');
});
