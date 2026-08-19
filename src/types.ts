export interface TransformationResult {
  newText: string;
  noticeText: string;
}

export interface Transformation {
  name: string;
  category?: string;
  requiresSelection?: boolean;
  requiresAi?: boolean;
  usesFullText?: boolean;
  transform: (text: string, context: TransformationContext) => TransformationResult | Promise<TransformationResult>;
}

export type TransformationId = string;

export interface PluginSettings {
  showRibbonIcon: boolean;
  showContextMenuSingle: boolean;
  showContextMenuSubmenu: boolean;
  enableLogging: boolean;
  enableTracking: boolean;
  openAiApiKey: string;
  openAiApiBase: string;
  openAiModel: string;
  largeContentOpenAiModel: string;
  highlightKeywords: string;
  folderClassificationFolders: string;
  customPromptPresets: CustomPromptPreset[];
  operationHistory: OperationHistoryEntry[];
  enabledTransformations: Record<TransformationId, boolean>;
  constanceDeviceId: string;
  billingEmail: string;
  freeCharacters: number;
  purchasedCharacters: number;
}

export interface TransformationContext {
  settings: PluginSettings;
  abortSignal?: AbortSignal;
}

export interface OperationHistorySnapshot {
  path: string;
  content: string;
  currentPath?: string;
  editorOnly?: boolean;
}

export interface OperationHistoryEntry {
  id: string;
  label: string;
  createdAt: string;
  snapshots: OperationHistorySnapshot[];
}

export interface CustomPromptPreset {
  name: string;
  prompt: string;
}
