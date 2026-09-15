// LLM factory — OpenAI / Anthropic / Gemini behind one streaming interface.
// stream({ system, turns:[{role,text}], imageDataUrl, imageDataUrls, maxTokens, onToken }) -> Promise<fullText>

function normalizeProviderName(provider) {
  if (!provider) return 'provider';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function formatProviderErrorMessage(error, provider) {
  const status = error && (error.status || error.statusCode || error.response?.status);
  const code = error && (error.code || error.error?.code);
  const rawMessage = (error && (error.message || String(error))) || '';
  const text = `${rawMessage} ${status || ''} ${code || ''}`.toLowerCase();
  const isQuota = status === 429 || code === 'insufficient_quota' || code === 'rate_limit_exceeded' || /quota|billing|rate limit|exceeded your current quota/i.test(text);
  if (isQuota) {
    const label = normalizeProviderName(provider);
    return `${label} quota or rate-limit hit. Check your plan/billing for the API key, wait a moment, or switch to another provider in Settings.`;
  }
  return rawMessage || 'Unknown LLM error.';
}

function stripDataUrl(dataUrl) {
  const m = /^data:(.+?);base64,(.*)$/s.exec(dataUrl || '');
  return m ? { mime: m[1], b64: m[2] } : null;
}

// Images may arrive as a single data URL (assist/ask, unchanged) or as an
// ordered array of them (leetcode page stack). The array wins when present.
function imageList({ imageDataUrl, imageDataUrls }) {
  if (Array.isArray(imageDataUrls) && imageDataUrls.length) return imageDataUrls.filter(Boolean);
  return imageDataUrl ? [imageDataUrl] : [];
}

function buildOpenAIMessages({ system, turns, imageDataUrl, imageDataUrls }) {
  const images = imageList({ imageDataUrl, imageDataUrls });
  const messages = [{ role: 'system', content: system }];
  turns.forEach((t, i) => {
    const last = i === turns.length - 1;
    if (last && images.length && t.role === 'user') {
      messages.push({ role: 'user', content: [
        { type: 'text', text: t.text },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } }))
      ] });
    } else {
      messages.push({ role: t.role, content: t.text });
    }
  });
  return messages;
}

function buildAnthropicMessages({ turns, imageDataUrl, imageDataUrls }) {
  const images = imageList({ imageDataUrl, imageDataUrls });
  return turns.map((t, i) => {
    const last = i === turns.length - 1;
    if (last && images.length && t.role === 'user') {
      const content = [];
      // Anthropic is the odd one out: images go AHEAD of the text block.
      for (const url of images) {
        const img = stripDataUrl(url);
        if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.b64 } });
      }
      content.push({ type: 'text', text: t.text });
      return { role: 'user', content };
    }
    return { role: t.role, content: t.text };
  });
}

function buildGeminiContents({ turns, imageDataUrl, imageDataUrls }) {
  const images = imageList({ imageDataUrl, imageDataUrls });
  return turns.map((t, i) => {
    const last = i === turns.length - 1;
    const parts = [{ text: t.text }];
    if (last && images.length && t.role === 'user') {
      for (const url of images) {
        const img = stripDataUrl(url);
        if (img) parts.push({ inlineData: { mimeType: img.mime, data: img.b64 } });
      }
    }
    return { role: t.role === 'assistant' ? 'model' : 'user', parts };
  });
}

async function streamOpenAI({ apiKey, model, system, turns, imageDataUrl, imageDataUrls, maxTokens, onToken }) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });
  const messages = buildOpenAIMessages({ system, turns, imageDataUrl, imageDataUrls });
  const stream = await client.chat.completions.create({ model, messages, stream: true, max_tokens: maxTokens });
  let full = '';
  for await (const part of stream) {
    const d = part.choices && part.choices[0] && part.choices[0].delta && part.choices[0].delta.content;
    if (d) { full += d; onToken(d); }
  }
  return full;
}

async function streamAnthropic({ apiKey, model, system, turns, imageDataUrl, imageDataUrls, maxTokens, onToken }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const messages = buildAnthropicMessages({ turns, imageDataUrl, imageDataUrls });
  const stream = await client.messages.create({ model, max_tokens: maxTokens, system, messages, stream: true });
  let full = '';
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { full += ev.delta.text; onToken(ev.delta.text); }
  }
  return full;
}

async function streamGemini({ apiKey, model, system, turns, imageDataUrl, imageDataUrls, maxTokens, onToken }) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildGeminiContents({ turns, imageDataUrl, imageDataUrls });
  const stream = await ai.models.generateContentStream({
    model, contents, config: { systemInstruction: system, maxOutputTokens: maxTokens }
  });
  let full = '';
  for await (const chunk of stream) {
    const t = chunk && chunk.text;
    if (t) { full += t; onToken(t); }
  }
  return full;
}

function createLLM(settings) {
  const provider = settings.provider;
  const keys = settings.apiKeys || {};
  const apiKey = keys[provider];
  const tier = settings.smart ? 'smart' : 'fast';
  let model = (settings.models[provider] || {})[tier];
  if (provider === 'gemini' && !/^gemini-/.test(model || '')) {
    model = 'gemini-2.0-flash';
  }
  if (!model) model = provider === 'gemini' ? 'gemini-2.0-flash' : (provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-latest');
  const maxTokens = settings.smart ? 3000 : 1800;

  return {
    provider, model, apiKey,
    ready: !!apiKey && !!model,
    async stream(params) {
      const args = { apiKey, model, maxTokens, ...params };
      try {
        if (provider === 'openai') return await streamOpenAI(args);
        if (provider === 'anthropic') return await streamAnthropic(args);
        if (provider === 'gemini') return await streamGemini(args);
        throw new Error('unknown provider: ' + provider);
      } catch (error) {
        throw new Error(formatProviderErrorMessage(error, provider));
      }
    }
  };
}

module.exports = {
  createLLM,
  formatProviderErrorMessage,
  buildOpenAIMessages,
  buildAnthropicMessages,
  buildGeminiContents
};
