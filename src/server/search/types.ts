import {
  SearchResult,
  SearchOptions,
  SearchSourceConfig,
  SearchMode,
  LanguageDetectionResult,
  TranslatedQuery,
  TranscriptionResult,
  GroundedSummary,
} from '../../shared/types.js';

/**
 * Phase 1: Core Knowledge Provider Interface
 */
export interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  searchZimSource?(source: SearchSourceConfig, query: string, mode?: SearchMode): Promise<SearchResult[]>;
}

/**
 * Phase 2: Optional Local Language & Translation Provider Interface
 */
export interface LanguageProvider {
  name: string;
  detectLanguage(query: string): Promise<LanguageDetectionResult>;
  translateQuery(query: string, targetLang: string): Promise<TranslatedQuery>;
  expandMultilingualQuery?(query: string): Promise<string[]>;
}

/**
 * Phase 3: Optional Local Speech-to-Text Provider Interface
 */
export interface SpeechToTextProvider {
  name: string;
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<TranscriptionResult>;
}

/**
 * Phase 4: Optional Grounded AI Summary Provider Interface
 */
export interface SummaryProvider {
  name: string;
  generateSummary(query: string, topResults: SearchResult[], options?: { maxTokens?: number }): Promise<GroundedSummary>;
}
