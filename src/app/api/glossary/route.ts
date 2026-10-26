import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LEN = 300;

interface GlossBody {
  german?: unknown;
}

interface Gloss {
  word: string;
  bangla: string;
}

export async function POST(req: NextRequest) {
  let body: GlossBody;
  try {
    body = (await req.json()) as GlossBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const text = typeof body.german === 'string' ? body.german.trim() : '';
  if (!text) return NextResponse.json({ error: 'EMPTY_INPUT' }, { status: 400 });
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: 'TEXT_TOO_LONG' }, { status: 400 });
  }

  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You are a German vocabulary glossing engine for Bengali-speaking A1 learners. ' +
            'For EACH distinct word of the given German sentence, output the most likely ' +
            'A1-level Bengali (Bangla) meaning in context. ' +
            'Respond with ONLY a JSON array like [{"word":"Ich","bangla":"আমি"},...] — ' +
            'no markdown, no commentary. Use the words exactly as spelled in the sentence.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? '';
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return NextResponse.json({ glosses: [] });

    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return NextResponse.json({ glosses: [] });

    const seen = new Set<string>();
    const glosses: Gloss[] = [];
    for (const item of parsed) {
      const g = item as Gloss;
      if (!g || typeof g.word !== 'string' || typeof g.bangla !== 'string') continue;
      const key = g.word.toLowerCase().replace(/[.,;:!?]/g, '');
      if (!key || !g.bangla.trim() || seen.has(key)) continue;
      seen.add(key);
      glosses.push({ word: g.word, bangla: g.bangla.trim() });
      if (glosses.length >= 40) break;
    }
    return NextResponse.json({ glosses });
  } catch (err) {
    console.error('[glossary] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ glosses: [], error: 'GLOSSARY_FAILED' }, { status: 200 });
  }
}
