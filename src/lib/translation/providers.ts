/**
 * Server-only translation providers.
 *
 * Chain (first success wins):
 *   1. LLM        — z-ai-web-dev-sdk chat model: highest quality, natural German
 *   2. MyMemory   — free, keyless fallback (fast, but TM matches can be noisy)
 *   3. Google gtx — keyless endpoint (works on many networks, blocked on some)
 *   4. DeepL      — only if DEEPL_API_KEY is configured (best quality, paid)
 *
 * API credentials stay on the server — the client only ever talks to
 * /api/translate. Secrets are read from process.env and never shipped.
 */

import type { InputLang } from '../types';

const LANG_NAMES: Record<InputLang, string> = {
  bn: 'Bengali',
  en: 'English',
  de: 'German',
};

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── MyMemory ─────────────────────────────────────────────────────────

async function myMemoryTranslate(text: string, from: InputLang, to: InputLang): Promise<string> {
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
    `&langpair=${from}|${to}&de=deutschflow@example.com`;
  const res = await fetchWithTimeout(url, { method: 'GET' });
  if (!res.ok) throw new Error(`mymemory ${res.status}`);
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number | string;
  };
  const out = data.responseData?.translatedText?.trim();
  const status = Number(data.responseStatus ?? 0);
  const looksInvalid =
    !out ||
    status !== 200 ||
    /^(MYMEMORY WARNING|QUERY LENGTH LIMIT|PLEASE SELECT)/i.test(out) ||
    out.toLowerCase() === text.toLowerCase();
  if (looksInvalid) throw new Error('mymemory empty');
  return out;
}

// ── LLM (z-ai-web-dev-sdk, backend only) ─────────────────────────────

async function llmTranslate(text: string, from: InputLang, to: InputLang): Promise<string> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content:
          'You are a precise translation engine. You output ONLY the translation, ' +
          'with no quotes, no explanations and no extra commentary. For German you ' +
          'produce natural Standard German (Hochdeutsch), keeping the register of ' +
          'the source text and preserving punctuation.',
      },
      {
        role: 'user',
        content: `Translate from ${LANG_NAMES[from]} to ${LANG_NAMES[to]}:\n\n${text}`,
      },
    ],
    thinking: { type: 'disabled' },
  });
  const out = completion.choices[0]?.message?.content?.trim();
  if (!out) throw new Error('llm empty');
  return out.replace(/^["“](.*)["”]$/s, '$1').trim();
}

// ── Google gtx (keyless) ─────────────────────────────────────────────

async function googleTranslate(text: string, from: InputLang, to: InputLang): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
    `&sl=${from}&tl=${to}&q=${encodeURIComponent(text)}`;
  const res = await fetchWithTimeout(url, { method: 'GET' });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('google parse');
  const parts = (data[0] as Array<[string] | null>)
    .map((seg) => seg?.[0] ?? '')
    .join('');
  const out = parts.trim();
  if (!out) throw new Error('google empty');
  return out;
}

// ── DeepL (optional, requires key) ───────────────────────────────────

async function deeplTranslate(text: string, from: InputLang, to: InputLang): Promise<string> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error('deepl no key');
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const res = await fetchWithTimeout(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: to === 'de' ? 'DE' : to === 'bn' ? 'BN' : 'EN-US',
      ...(from === 'en' ? { source_lang: 'EN' } : from === 'bn' ? { source_lang: 'BN' } : { source_lang: 'DE' }),
    }),
  });
  if (!res.ok) throw new Error(`deepl ${res.status}`);
  const data = (await res.json()) as { translations?: Array<{ text?: string }> };
  const out = data.translations?.[0]?.text?.trim();
  if (!out) throw new Error('deepl empty');
  return out;
}

// ── Chain ────────────────────────────────────────────────────────────

export async function translateWithFallback(
  text: string,
  from: InputLang,
  to: InputLang
): Promise<string> {
  const chain: Array<[string, () => Promise<string>]> = [
    ['llm', () => llmTranslate(text, from, to)],
    ['mymemory', () => myMemoryTranslate(text, from, to)],
    ['google', () => googleTranslate(text, from, to)],
    ...(process.env.DEEPL_API_KEY ? ([['deepl', () => deeplTranslate(text, from, to)]] as const) : []),
  ];

  const errors: string[] = [];
  for (const [name, fn] of chain) {
    try {
      const out = await fn();
      if (out) return out;
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }
  throw new Error(`ALL_PROVIDERS_FAILED (${errors.join(' | ')})`);
}
