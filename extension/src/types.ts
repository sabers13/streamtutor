export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface ImportantWord {
  word: string;
  meaning: string;
}

export interface AnalyzeSentenceRequest {
  text: string;
  previous?: string;
  next?: string;
  user_level?: string;
  threshold?: string;
  ai_enabled?: boolean;
}

export interface AnalyzeSentenceResponse {
  text: string;
  estimated_level: CefrLevel;
  show_help: boolean;
  translation: string;
  note: string;
  important_words: ImportantWord[];
}

export interface ExplainSentenceRequest {
  text: string;
  previous?: string;
  next?: string;
  user_level?: string;
}

export interface ExplainSentenceResponse {
  text: string;
  explanation: string;
}

export interface SubtitleCue {
  text: string;
  start?: number; // milliseconds
  end?: number;   // milliseconds
  track?: number;
  index?: number;
}

export type OverlayPosition = 'bottom' | 'top' | 'left' | 'right';

export interface TutorSettings {
  enabled: boolean;
  aiEnabled: boolean;
  userLevel: CefrLevel;
  threshold: CefrLevel;
  backendUrl: string;
  position: OverlayPosition;
}

export const DEFAULT_SETTINGS: TutorSettings = {
  enabled: true,
  aiEnabled: false,
  userLevel: 'A2',
  threshold: 'B1',
  backendUrl: 'http://localhost:8000',
  position: 'bottom',
};

export interface LookupWordResponse {
  word: string;
  meaning: string;
  base_form?: string | null;
  grammar?: string | null;
}

export interface SaveFlashcardRequest {
  front: string;
  back: string;
  card_type?: 'word' | 'sentence' | 'grammar';
  example_sentence?: string;
  sentence_translation?: string;
  grammar_note?: string;
  cefr_level?: string;
  source?: string;
}

export interface SaveFlashcardResponse {
  success: boolean;
  total_saved: number;
  message: string;
}
