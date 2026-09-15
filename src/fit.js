// Keep a multi-image request inside the provider's payload budget.
//
// Limits read from each provider's own docs on 15 Sep 2026:
//   Gemini    20 MB total request size, measured on the base64. Hard HTTP 413.
//   Anthropic 32 MB per request, 10 MB per image (base64).
//   OpenAI    512 MB per request; no per-image byte cap documented.
// Budgets below leave headroom for the system prompt, the text turn and JSON.
//
// No electron import: `resize` is injected so this runs under `node --test`.
const PROVIDER_BUDGET_BYTES = {
  gemini: 18 * 1024 * 1024,
  anthropic: 28 * 1024 * 1024,
  openai: 64 * 1024 * 1024
};

// 1600 is the floor: it is the lowest long edge any provider's documentation
// backs for screenshots (OpenAI's computer-use guide). Below it we would be
// guessing about whether small monospaced text survives.
const LONG_EDGE_STEPS = [2560, 2048, 1600];

const SMALLEST_BUDGET = Math.min(...Object.values(PROVIDER_BUDGET_BYTES));

function totalBytes(images) {
  return images.reduce((n, u) => n + (u ? u.length : 0), 0);
}

function fitImages(images, { provider, resize, budgetBytes, steps = LONG_EDGE_STEPS } = {}) {
  const budget = budgetBytes || PROVIDER_BUDGET_BYTES[provider] || SMALLEST_BUDGET;
  const asIs = totalBytes(images);
  if (asIs <= budget) return { images: images.slice(), longEdge: null, bytes: asIs, overBudget: false, budget };

  let out = images;
  let edge = null;
  for (const step of steps) {
    edge = step;
    // Always resize from the originals — resizing an already-resized frame
    // compounds the quality loss for no extra saving.
    out = images.map((u) => resize(u, step));
    const bytes = totalBytes(out);
    if (bytes <= budget) return { images: out, longEdge: step, bytes, overBudget: false, budget };
  }
  return { images: out, longEdge: edge, bytes: totalBytes(out), overBudget: true, budget };
}

module.exports = { fitImages, totalBytes, PROVIDER_BUDGET_BYTES, LONG_EDGE_STEPS };
