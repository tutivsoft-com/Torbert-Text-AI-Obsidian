import type { DataAdapter } from "obsidian";
import { diagnostics } from "./diagnostics";
/** Compatibility API backed by PluginSupport's bounded privacy-safe memory buffer. */
const knownSources = new Set(["Plugin.onload","Plugin.onunload","chargeCharacters","applyTransformationToEditor","applyTransformationToFile","applyTransformationToFolder","applyPendingFolderWrites","classifyFiles","applyMovePlan","createWeakTitlesReport","createDuplicateNotesReport","applyCustomPromptToFile","applyCustomPromptToFolder","applyCustomPromptFolderWrites","restoreLastOperation"]);
const safeSource = (source: string): string => knownSources.has(source) ? source : "operation";
export class FileLogger {
  constructor(_adapter: DataAdapter, _logFilePath: string) {}
  setEnabled(_enabled: boolean): void {}
  info(_source: string, _message: string, ..._details: unknown[]): void { diagnostics.legacy("info", safeSource(_source) + ".progress"); }
  warn(_source: string, _message: string, ..._details: unknown[]): void { diagnostics.legacy("warn", safeSource(_source) + ".warning"); }
  error(_source: string, _message: string, ..._details: unknown[]): void { diagnostics.legacy("error", safeSource(_source) + ".failed"); }
}
