/**
 * Online German TTS proxy — the "configured provider" tier of the audio
 * pipeline.
 *
 * Design rules (see the TTS compatibility spec):
 *   - Optional by design: with no provider configured this answers
 *     501 {error:'unconfigured'} and the app falls back to native voices +
 *     manual alternatives. No paid provider is ever required.
 *   - Secrets stay server-side: the API key is read from env here and is
 *     never shipped to the frontend, never logged, never echoed.
 *   - Timeouts + cancellation on the upstream fetch; explicit, classified
 *     error codes so the client can explain failures honestly.
 *
 * Configuration (copy to .env.local):
 *   TTS_PROVIDER=voicerss      # or: google
 *   TTS_API_KEY=...            # provider key, server-side only
 *
 *   voicerss — free-tier friendly (https://www.voicerss.org)
 *   google   — Google Cloud Text-to-Speech REST (paid unless free credits)
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LENGTH = 500;
const UPSTREAM_TIMEOUT_MS = 10_000;

type ProviderId = 'voicerss' | 'google';

function providerFromEnv(): { id: ProviderId; key: string } | null {
  const id = process.env.TTS_PROVIDER;
  const key = process.env.TTS_API_KEY;
  if (!key || key.trim().length === 0) return null;
  if (id === 'voicerss' || id === 'google') return { id, key };
  return null; // unknown/absent provider id → treat as unconfigured
}

function errorJson(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

/** Google Cloud TTS: JSON in → base64 audio out. */
async function googleTts(text: string, key: string): Promise<Response> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'de-DE' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1 },
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    }
  );
  if (!res.ok) return res;
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    return NextResponse.json({ error: 'PROVIDER_BAD_RESPONSE' }, { status: 502 });
  }
  return new Response(Buffer.from(data.audioContent, 'base64'), {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
  });
}

/** VoiceRSS: query-string GET → direct audio stream. */
async function voicerssTts(text: string, key: string): Promise<Response> {
  const params = new URLSearchParams({
    key,
    hl: 'de-de',
    src: text,
    r: '0',
    c: 'MP3',
    f: '48khz_16bit_stereo',
  });
  const res = await fetch(`https://api.voicerss.org/?${params.toString()}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) return res;
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('audio/')) {
    // VoiceRSS reports errors (invalid key, quota) as plain text bodies.
    await res.text(); // drain; never surface the body — it may echo the key
    return NextResponse.json({ error: 'PROVIDER_REJECTED' }, { status: 502 });
  }
  return new Response(res.body, {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
  });
}

export async function GET(req: NextRequest) {
  // Availability probe — cheap, side-effect free, no key material involved.
  if (req.nextUrl.searchParams.get('probe')) {
    return providerFromEnv() ? new Response(null, { status: 200 }) : errorJson('unconfigured', 501);
  }

  const provider = providerFromEnv();
  if (!provider) return errorJson('unconfigured', 501);

  const text = (req.nextUrl.searchParams.get('text') ?? '').trim();
  if (!text) return errorJson('EMPTY_TEXT', 400);
  if (text.length > MAX_LENGTH) return errorJson('TEXT_TOO_LONG', 400);

  try {
    const upstream =
      provider.id === 'google'
        ? await googleTts(text, provider.key)
        : await voicerssTts(text, provider.key);

    if (upstream.status === 429) return errorJson('RATE_LIMITED', 503);
    if (!upstream.ok) return errorJson('PROVIDER_ERROR', 502);

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        // Client-side IDB caching is authoritative; HTTP cache is a small bonus.
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return errorJson('UPSTREAM_TIMEOUT', 504);
    }
    return errorJson('NETWORK_ERROR', 502);
  }
}
