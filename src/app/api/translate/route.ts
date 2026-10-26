import { NextRequest, NextResponse } from 'next/server';
import { detectLanguage } from '@/lib/language';
import { translateWithFallback } from '@/lib/translation/providers';
import type { InputLang } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LENGTH = 1000;

interface TranslateBody {
  text?: unknown;
  from?: unknown;
}

export async function POST(req: NextRequest) {
  let body: TranslateBody;
  try {
    body = (await req.json()) as TranslateBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'EMPTY_INPUT' }, { status: 400 });
  }
  if (text.length > MAX_LENGTH) {
    return NextResponse.json({ error: 'TEXT_TOO_LONG' }, { status: 400 });
  }

  // Trust the client hint when valid, otherwise detect server-side as well.
  const hinted = body.from as InputLang;
  const from: InputLang =
    hinted === 'bn' || hinted === 'en' || hinted === 'de' ? hinted : detectLanguage(text);

  try {
    if (from === 'de') {
      // German input: play as-is; Bangla meaning is best-effort.
      let bangla: string | null = null;
      try {
        bangla = await translateWithFallback(text, 'de', 'bn');
      } catch {
        bangla = null;
      }
      return NextResponse.json({ german: text, bangla, translated: false });
    }

    const [german, bangla] = await Promise.all([
      translateWithFallback(text, from, 'de'),
      from === 'bn'
        ? Promise.resolve(text)
        : translateWithFallback(text, from, 'bn').catch(() => null),
    ]);

    if (!german) {
      return NextResponse.json({ error: 'TRANSLATION_FAILED' }, { status: 502 });
    }
    return NextResponse.json({ german, bangla, translated: true });
  } catch (err) {
    console.error('[translate] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'TRANSLATION_FAILED', detail: err instanceof Error ? err.message : undefined },
      { status: 502 }
    );
  }
}
