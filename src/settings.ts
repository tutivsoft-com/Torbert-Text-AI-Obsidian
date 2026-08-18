import { transformations } from "./transformations";
import type { PluginSettings } from "./types";

// New transformations are enabled by default so they appear in the submenu
// unless the user explicitly disables them in Obsidian settings.
export const DEFAULT_SETTINGS: PluginSettings = {
  showRibbonIcon: true,
  showContextMenuSingle: true,
  showContextMenuSubmenu: true,
  enableLogging: true,
  enableTracking: false,
  openAiApiKey: "",
  openAiApiBase: "https://openrouter.ai/api/v1",
  openAiModel: "openai/gpt-5-mini",
  largeContentOpenAiModel: "openai/gpt-5-mini",
  highlightKeywords: "",
  folderClassificationFolders: "Jobs\nClients\nDevOps\nFinance",
  customPromptPresets: [
    {
      name: "Job Search cleanup",
      prompt: "Clean up this job-search note. Preserve facts, company names, roles, deadlines, links, and contact details. Improve headings, bullets, action items, and searchability.",
    },
    {
      name: "DevOps note cleanup",
      prompt: "Clean up this DevOps note. Preserve commands, IPs, ports, credentials references, paths, logs, and runbook sequence. Improve headings, bullets, and operational clarity.",
    },
    {
      name: "Client CRM cleanup",
      prompt: "Clean up this client CRM note. Preserve names, organizations, emails, phone numbers, commitments, dates, and next steps. Improve structure and action items.",
    },
  ],
  operationHistory: [],
  enabledTransformations: Object.keys(transformations).reduce(
    (enabledTransformations, transformationId) => ({
      ...enabledTransformations,
      [transformationId]: true,
    }),
    {} as PluginSettings["enabledTransformations"],
  ),
};
