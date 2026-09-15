// Page stack for capturing a problem that spans several screenfuls.
// Pure logic on purpose: no electron import, so it runs under `node --test`.
const crypto = require('crypto');

const MAX_PAGES = 6;

function hashFrame(dataUrl) {
  return crypto.createHash('sha1').update(String(dataUrl)).digest('hex');
}

function createPageStack({ maxPages = MAX_PAGES, hash = hashFrame } = {}) {
  const frames = []; // { dataUrl, hash }

  return {
    add(dataUrl) {
      if (!dataUrl) return { ok: false, reason: 'empty', count: frames.length };
      if (frames.length >= maxPages) return { ok: false, reason: 'full', count: frames.length };
      const h = hash(dataUrl);
      const last = frames[frames.length - 1];
      // Only a consecutive repeat is a mistake — scrolling back to an earlier
      // part of the problem and re-shooting it is legitimate.
      if (last && last.hash === h) return { ok: false, reason: 'duplicate', count: frames.length };
      frames.push({ dataUrl, hash: h });
      return { ok: true, count: frames.length };
    },
    list() { return frames.map((f) => f.dataUrl); },
    count() { return frames.length; },
    clear() { frames.length = 0; }
  };
}

module.exports = { createPageStack, hashFrame, MAX_PAGES };
