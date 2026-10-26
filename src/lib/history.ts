import type { FlowResult, HistoryItem } from './types';

const STORAGE_KEY = 'deutschflow.history.v1';
export const DEFAULT_HISTORY_LIMIT = 100;

function safeParse(raw: string | null): HistoryItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is HistoryItem =>
        !!item &&
        typeof (item as HistoryItem).id === 'string' &&
        typeof (item as HistoryItem).german === 'string' &&
        typeof (item as HistoryItem).bengali === 'string'
    );
  } catch {
    return [];
  }
}

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function persist(items: HistoryItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    let limit = DEFAULT_HISTORY_LIMIT;
    try {
      const settings = window.localStorage.getItem('deutschflow.settings.v1');
      if (settings) {
        const parsed = JSON.parse(settings) as { state?: { historyLimit?: number } };
        if (parsed.state?.historyLimit && parsed.state.historyLimit > 0) {
          limit = parsed.state.historyLimit;
        }
      }
    } catch {
      /* settings unavailable — use the default */
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, limit)));
  } catch {
    // Storage full or blocked — history is a nice-to-have, never break the app.
  }
}

export function addToHistory(items: HistoryItem[], result: FlowResult): HistoryItem[] {
  const entry: HistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    german: result.german,
    bengali: result.bengali,
    bangla: result.bangla,
    sourceText: result.sourceText,
    sourceLang: result.sourceLang,
    createdAt: Date.now(),
  };
  // De-duplicate identical German sentences, newest first.
  const next = [entry, ...items.filter((it) => it.german !== entry.german)];
  persist(next);
  return next;
}

export function clearHistory(): HistoryItem[] {
  persist([]);
  return [];
}

export function removeHistoryItem(id: string, items: HistoryItem[]): HistoryItem[] {
  const next = items.filter((it) => it.id !== id);
  persist(next);
  return next;
}
