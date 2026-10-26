// Shared types for DeutschFlow

export type InputLang = 'bn' | 'en' | 'de';

export interface PronunciationWord {
  /** Original German word */
  german: string;
  /** Bengali-script approximation */
  bengali: string;
  /** Where the pronunciation came from */
  source: 'lexicon' | 'rules' | 'override';
}

export interface PronunciationResult {
  /** Full Bengali transliteration of the German text */
  bengali: string;
  /** Word-by-word breakdown for the pronunciation chips */
  words: PronunciationWord[];
  /** 0..1 rough confidence of the engine for this sentence */
  confidence: number;
  /** True when some characters could not be mapped reliably */
  hasUncertain: boolean;
}

export interface HistoryItem {
  id: string;
  german: string;
  bengali: string;
  bangla: string | null;
  sourceText: string;
  sourceLang: InputLang;
  createdAt: number;
}

export interface FlowResult {
  german: string;
  bengali: string;
  bangla: string | null;
  words: PronunciationWord[];
  approximate: boolean;
  /** 0..1 engine confidence for this result */
  confidence: number;
  sourceText: string;
  sourceLang: InputLang;
  /** True when a translation provider produced the German text */
  translated: boolean;
}

export interface TranslateResponse {
  german: string;
  bangla: string | null;
  translated: boolean;
}
