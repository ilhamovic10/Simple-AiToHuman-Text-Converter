export type Tone = 'professional' | 'casual' | 'academic' | 'friendly' | 'confident' | 'researcher';
export type Voice = 'first-person' | 'third-person' | 'objective';
export type OutputFormat = 'docx' | 'pdf';

export interface RewriteOptions {
  tone: Tone;
  voice: Voice;
  expand?: boolean;
}

export type ChangeType = 'REPHRASE' | 'ADD_CONTRACTION' | 'REMOVE_PHRASE' | 'IMPROVE_FLOW' | 'EXPAND';

export interface ConversionChange {
  type: ChangeType;
  originalText: string;
  humanizedText: string;
  explanation: string;
}

export interface HumanizationStats {
    totalChanges: number;
    phrasesReplaced: number;
    contractionsAdded: number;
}

export interface HumanizationResult {
  text: string;
  changes: ConversionChange[];
  stats: HumanizationStats;
}
