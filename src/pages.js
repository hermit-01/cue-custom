// Page stack for capturing a problem that spans several screenfuls.
// Pure logic on purpose: no electron import, so it runs under `node --test`.
const crypto = require('crypto');

const MAX_PAGES = 6;

function hashFrame(dataUrl) {
  return crypto.createHash('sha1').update(String(dataUrl)).digest('hex');
}

function createPageStack({ maxPages = MAX_PAGES, hash = hashFrame } = {}) {
  const frames = []; // { dataUrl, hash }
  let generation = 0;

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
    // A wipe invalidates every position a caller may have snapshotted (e.g.
    // main.js's sentCount) — bump the generation so such a snapshot can be
    // recognized as stale. add() and drop() never touch this: only a clear
    // moves the goalposts.
    clear() { frames.length = 0; generation += 1; },
    gen() { return generation; },
    // Removes the first n frames (the ones that were actually sent), leaving
    // any frame captured after the send — e.g. mid-stream via addPage — intact.
    drop(n) {
      const k = Math.max(0, Math.min(n, frames.length));
      frames.splice(0, k);
      return frames.length;
    }
  };
}

module.exports = { createPageStack, hashFrame, MAX_PAGES };
