/**
 * Custom Lexicon Rules and Sensitivity Settings
 * Stored locally in browser localStorage
 */

export interface CustomWordRule {
  word: string;
  weight: number; // -5 to +5
  category?: string;
}

export interface EngineSettings {
  positiveThreshold: number; // e.g. 0.05
  negativeThreshold: number; // e.g. -0.05
  negationMultiplier: number; // default 0.74 (standard VADER inversion damping)
  boosterMultiplier: number; // default 1.35
  enableSarcasmHeuristics: boolean;
}

export const DEFAULT_SETTINGS: EngineSettings = {
  positiveThreshold: 0.05,
  negativeThreshold: -0.05,
  negationMultiplier: 0.74,
  boosterMultiplier: 1.35,
  enableSarcasmHeuristics: true
};

const STORAGE_KEY_CUSTOM_WORDS = "sentix_custom_words_v1";
const STORAGE_KEY_SETTINGS = "sentix_engine_settings_v1";

export function loadCustomWords(): CustomWordRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_WORDS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCustomWords(words: CustomWordRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_WORDS, JSON.stringify(words));
  } catch (e) {
    console.error("Failed to save custom words to localStorage", e);
  }
}

export function loadEngineSettings(): EngineSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveEngineSettings(settings: EngineSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save engine settings to localStorage", e);
  }
}
