import { selectedFiles, markdownFile, registerSelectionAction } from "./selection-scope";
import { diagnostics } from "./diagnostics";
import { showAccountWelcome } from "./constance-account";
import { Modal, Notice, Plugin, TFile, TFolder, type App, type Editor, type Menu, type MenuItem } from "obsidian";
import { classifyFolderFromContent, collectAiUsageDuring, parseOpenAiApiKey, rewriteWithOpenAi, sanitizeFolderName, type AiUsageSummary } from "./ai";
import { isWeakTitle, noteSimilarity, parseFolderList } from "./feature-utils";
import { FileLogger } from "./logger";
import { checkCharactersAvailable, generateEventId, retryPendingSpendEvents, resumePendingCheckout, resumePendingPaddleCheckout, spendConstanceCredits, syncPurchasedCharactersFromConstance } from "./billing";
import { claimAccountFreeUsage, ensureBillingAccessToken, clearBillingSession } from "./constance-account";
import { DEFAULT_SETTINGS } from "./settings";
import { TorbertTextAiSettingTab } from "./settings-tab";
import { transformations } from "./transformations";
import type { CustomPromptPreset, OperationHistoryEntry, OperationHistorySnapshot, PluginSettings, TransformationId } from "./types";
import { PluginSupport } from "./plugin-support";
import { AiRequestQueue, type QueueReporter } from "./ai-request-queue";

interface BatchReportItem {
  path: string;
  newPath?: string;
  status: "changed" | "moved" | "renamed" | "unchanged" | "failed";
  message?: string;
}

const GENERATED_REPORT_FOLDER_NAME = "Torbert Reports";
const TRANSFORMATION_CATEGORY_ORDER = [
  "AI",
  "Text Cleanup",
  "Markdown Notes",
];

interface ProcessingNotice {
  abortSignal: AbortSignal;
  throwIfCancelled: () => void;
  wasCancelled: () => boolean;
  close: () => void;
}

interface PreviewItem {
  label: string;
  detail?: string;
}

function summarizeTextChange(before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  let firstDifferent = 0;

  while (firstDifferent < beforeLines.length && firstDifferent < afterLines.length && beforeLines[firstDifferent] === afterLines[firstDifferent]) {
    firstDifferent++;
  }

  let lastBefore = beforeLines.length - 1;
  let lastAfter = afterLines.length - 1;
  while (lastBefore >= firstDifferent && lastAfter >= firstDifferent && beforeLines[lastBefore] === afterLines[lastAfter]) {
    lastBefore--;
    lastAfter--;
  }

  const start = Math.max(0, firstDifferent - 2);
  const lines = [`Before (${beforeLines.length} line(s)):`];
  if (start > 0) {
    lines.push("  …");
  }
  lines.push(...beforeLines.slice(start, lastBefore + 1).map((line) => `- ${line}`));
  if (lastBefore + 1 < beforeLines.length) {
    lines.push("  …");
  }
  lines.push(`After (${afterLines.length} line(s)):`);
  if (start > 0) {
    lines.push("  …");
  }
  lines.push(...afterLines.slice(start, lastAfter + 1).map((line) => `+ ${line}`));
  if (lastAfter + 1 < afterLines.length) {
    lines.push("  …");
  }

  return lines.join("\n");
}

/** Existing command calls apply immediately; operation history remains available for Undo. */
class BatchPreviewModal extends Modal {
  constructor(app: App, _title: string, _items: PreviewItem[], private readonly onApply: () => void) {
    super(app);
  }

  open(): void {
    this.onApply();
  }
}

export default class TorbertTextAiPlugin extends Plugin {
  refreshBillingCredits?: () => void;
  support!: PluginSupport;
  settings!: PluginSettings;
  private logger!: FileLogger;
  aiQueue!: AiRequestQueue;
  private queueReporter?: QueueReporter;

  async onload(): Promise<void> {
let diagnosticStartupEnd: () => void = () => {};

const diagnosticEnd1 = diagnostics?.start?.("main.onload") ?? (() => {});
try {

    this.support = new PluginSupport(this, { name: "Torbert Text AI", summary: "Transform, summarize, organize, and clean Markdown text.", quickStart: ["Sign in to your account in Settings.", "Select text or open a note.", "Choose a Torbert transformation; it applies automatically and can be undone."], commands: ["Open transformations", "Undo last operation", "Copy diagnostic log"], troubleshooting: ["Use Copy diagnostic log before reporting a problem.", "Confirm the current note is Markdown and editable."] });
    this.support.start();
    try {
      const logFilePath = `${this.manifest.dir || "."}/plugin.log`;

      this.logger = new FileLogger(this.app.vault.adapter, logFilePath);
      await this.loadSettings();
diagnosticStartupEnd = diagnostics?.start?.("startup.initialize") ?? (() => {});

      this.aiQueue = new AiRequestQueue(this.app, "Torbert", () => this.support.automaticWindowsEnabled());
    await showAccountWelcome(this, this.settings, () => this.saveSettings());
      if (!this.settings.constanceDeviceId) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        this.settings.constanceDeviceId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        await this.saveSettings();
      }
      this.settings.pendingSpendEvents = Array.isArray(this.settings.pendingSpendEvents) ? this.settings.pendingSpendEvents.filter((item) => item && typeof item.eventId === "string" && Number.isInteger(item.amount) && item.amount > 0) : [];
      const pendingCheckout = this.settings.pendingCheckout;
      this.settings.pendingCheckout = pendingCheckout && typeof pendingCheckout.idempotencyKey === "string" && typeof pendingCheckout.planCode === "string" ? pendingCheckout : null;
      await this.saveSettings();
      this.logger.setEnabled(this.settings.enableLogging);
      this.logger.info("Plugin.onload", "Plugin is loading.");

      // Background balance sync; never blocks load, fails silently offline.
      void diagnostics.guard("main.background_1", () => (syncPurchasedCharactersFromConstance(this).then(() => retryPendingSpendEvents(this))));
      resumePendingCheckout(this);
      resumePendingPaddleCheckout(this);

      if (this.settings.showRibbonIcon) {
        this.addRibbonIcon("wand", "Replace bold with highlight", () => diagnostics.guard("main.event_2", () => (this.applyTransformationToEditor(null, "boldToHighlight"))));
      }

      this.addCommand({
        id: "replace-bold-with-highlight",
        name: "Text Cleanup / Bold to Highlight",
        editorCallback: (editor) => this.applyTransformationToEditor(editor, "boldToHighlight"),
      });
      this.addCommand({
        id: "restore-last-torbert-change",
        name: "Restore last change",
        callback: () => this.restoreLastOperation(),
      });
      this.registerTransformationCommands();
      this.addCommand({ id: "show-ai-request-queue", name: "Show AI request queue", callback: () => this.aiQueue.open() });

      // Editor, file, and recursive folder context menus use the same
      // transformation registry. Editor targets may use the current selection;
      // file and folder targets transform whole Markdown files.
      const addTransformationMenuItems = (menu: Menu, target: Editor | TFile | TFolder) => {
        const showQuickBold = this.settings.showContextMenuSingle && this.settings.enabledTransformations.boldToHighlight;
        if (showQuickBold) {
          menu.addItem((item) => {
            item
              .setTitle("Torbert: Bold to Highlight")
              .setIcon("wand")
              .onClick(() => {
return diagnostics.guard("main.control_3", () => {
const diagnosticAction2 = () => {

                if (target instanceof TFolder) {
                  void diagnostics.guard("main.background_4", () => (this.applyTransformationToFolder(target, "boldToHighlight")));
                } else if (target instanceof TFile) {
                  void diagnostics.guard("main.background_5", () => (this.applyTransformationToFile(target, "boldToHighlight")));
                } else {
                  void diagnostics.guard("main.background_6", () => (this.applyTransformationToEditor(target, "boldToHighlight")));
                }

}; return diagnostics?.run ? diagnostics.run("control.6878.onClick", diagnosticAction2) : diagnosticAction2();

});
});
          });
        }

        if (this.settings.showContextMenuSubmenu) {
          const enabledTransformations = Object.entries(transformations)
            .filter(([transformationId]) => this.settings.enabledTransformations[transformationId])
            .filter(([transformationId]) => !(showQuickBold && transformationId === "boldToHighlight"));

          if (enabledTransformations.length > 0) {
            menu.addItem((item) => {
              item.setTitle("Torbert Text AI").setIcon("brain-circuit");

              const submenu = (item as MenuItem & { setSubmenu: () => Menu }).setSubmenu();

              TRANSFORMATION_CATEGORY_ORDER
                .map((category) => [
                  category,
                  enabledTransformations.filter(([, transformation]) => (transformation.category || "Text Cleanup") === category),
                ] as const)
                .forEach(([category, transformationsForCategory]) => {
                  const hasFileActions = category === "AI" && (target instanceof TFile || target instanceof TFolder);
                  const hasFolderReports = category === "Markdown Notes" && target instanceof TFolder;
                  const hasRestoreAction = category === "Markdown Notes";
                  if (transformationsForCategory.length === 0 && !hasFileActions && !hasFolderReports && !hasRestoreAction) {
                    return;
                  }

                  submenu.addItem((categoryItem) => {
                    categoryItem.setTitle(category);
                    const categoryMenu = (categoryItem as MenuItem & { setSubmenu: () => Menu }).setSubmenu();

                    if (hasFileActions) {
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle("Classify folder")
                          .onClick(() => {
return diagnostics.guard("main.control_7", () => {
const diagnosticAction3 = () => {

                            if (target instanceof TFolder) {
                              void diagnostics.guard("main.background_8", () => (this.classifyFilesInFolder(target)));
                            } else {
                              void diagnostics.guard("main.background_9", () => (this.classifyFile(target)));
                            }

}; return diagnostics?.run ? diagnostics.run("control.9169.onClick", diagnosticAction3) : diagnosticAction3();

});
});
                      });
                    }

                    transformationsForCategory.forEach(([transformationId, transformation]) => {
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle(this.getTransformationMenuTitle(transformation))
                          .onClick(() => {
return diagnostics.guard("main.control_10", () => {
const diagnosticAction4 = () => {

                            if (target instanceof TFolder) {
                              void diagnostics.guard("main.background_11", () => (this.applyTransformationToFolder(target, transformationId)));
                            } else if (target instanceof TFile) {
                              void diagnostics.guard("main.background_12", () => (this.applyTransformationToFile(target, transformationId)));
                            } else {
                              void diagnostics.guard("main.background_13", () => (this.applyTransformationToEditor(target, transformationId)));
                            }

}; return diagnostics?.run ? diagnostics.run("control.9832.onClick", diagnosticAction4) : diagnosticAction4();

});
});
                      });
                    });

                    if (category === "AI" && (target instanceof TFile || target instanceof TFolder)) {
                      const presets = this.getCustomPromptPresets();
                      if (presets.length > 0) {
                        categoryMenu.addSeparator();
                        categoryMenu.addItem((presetGroup) => {
                          presetGroup.setTitle("Saved prompt presets");
                          const presetMenu = (presetGroup as MenuItem & { setSubmenu: () => Menu }).setSubmenu();
                          presets.forEach((preset) => {
                            presetMenu.addItem((submenuItem) => {
                              submenuItem
                                .setTitle(preset.name)
                                .onClick(() => {
return diagnostics.guard("main.control_14", () => {
const diagnosticAction5 = () => {

                                  if (target instanceof TFolder) {
                                    void diagnostics.guard("main.background_15", () => (this.applyCustomPromptToFolder(target, preset)));
                                  } else {
                                    void diagnostics.guard("main.background_16", () => (this.applyCustomPromptToFile(target, preset)));
                                  }

}; return diagnostics?.run ? diagnostics.run("control.11181.onClick", diagnosticAction5) : diagnosticAction5();

});
});
                            });
                          });
                        });
                      }
                    }

                    if (category === "Markdown Notes" && target instanceof TFolder) {
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle("Find Weak Titles")
                          .onClick(() => {
return diagnostics.guard("main.control_17", () => {
const diagnosticAction6 = () => {

                            void diagnostics.guard("main.background_18", () => (this.createWeakTitlesReport(target)));

}; return diagnostics?.run ? diagnostics.run("control.11959.onClick", diagnosticAction6) : diagnosticAction6();

});
});
                      });
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle("Find Duplicate Notes")
                          .onClick(() => {
return diagnostics.guard("main.control_19", () => {
const diagnosticAction7 = () => {

                            void diagnostics.guard("main.background_20", () => (this.createDuplicateNotesReport(target)));

}; return diagnostics?.run ? diagnostics.run("control.12286.onClick", diagnosticAction7) : diagnosticAction7();

});
});
                      });
                    }

                    if (category === "Markdown Notes") {
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle("Restore Last Change")
                          .onClick(() => {
return diagnostics.guard("main.control_21", () => {
const diagnosticAction8 = () => {

                            void diagnostics.guard("main.background_22", () => (this.restoreLastOperation()));

}; return diagnostics?.run ? diagnostics.run("control.12696.onClick", diagnosticAction8) : diagnosticAction8();

});
});
                      });
                    }
                  });
                });
            });
          }
        }
      };

      this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => diagnostics.guard("main.event_23", () => (addTransformationMenuItems(menu, editor)))));
      this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
return diagnostics.guard("main.event_24", () => {
        if (file instanceof TFile && file.extension === "md") {
          addTransformationMenuItems(menu, file);
        } else if (file instanceof TFolder) {
          addTransformationMenuItems(menu, file);
        }

});
}));

      this.registerEvent(this.app.workspace.on("files-menu", (menu, entries) => {
        if (!this.settings.showContextMenuSingle && !this.settings.showContextMenuSubmenu) return;
        const files = selectedFiles(entries, file => markdownFile(file) && !file.path.split("/").includes(GENERATED_REPORT_FOLDER_NAME));
        if (!files.length) return;
        menu.addItem(item => {
          item.setTitle(`Torbert: Process ${files.length} selected notes`).setIcon("wand");
          const submenu = (item as MenuItem & { setSubmenu: () => Menu }).setSubmenu();
          for (const [id, transformation] of Object.entries(transformations)) {
            if (!this.settings.enabledTransformations[id]) continue;
            submenu.addItem(action => action.setTitle(transformation.name).onClick(() => {
              void diagnostics.guard("selection.transform", () => this.applyTransformationToFolder(this.app.vault.getRoot(), id as TransformationId, false, files));
            }));
          }
          for (const preset of this.getCustomPromptPresets()) submenu.addItem(action => action.setTitle(`Prompt: ${preset.name}`).onClick(() => {
            void diagnostics.guard("selection.prompt", () => this.applyCustomPromptToFolder(this.app.vault.getRoot(), preset, false, files));
          }));
        });
      }));
      this.addSettingTab(new TorbertTextAiSettingTab(this.app, this));
      this.support.showWelcome();
      this.logger.info("Plugin.onload", "Plugin has loaded successfully.");
    } catch (error) {
diagnostics.failure("main.caught_extra_1", error);
      diagnostics?.legacy?.("error", "main.torbert_text_ai_failed_to_load_");
      new Notice("Torbert Text AI could not load. Reload Obsidian and try again.");
    }

} catch (diagnosticError1) { diagnostics?.failure?.("main.onload", diagnosticError1); throw diagnosticError1; } finally { diagnosticStartupEnd();  diagnostics?.legacy?.("info", "startup.finished"); diagnosticEnd1(); }
}

  /** Register every transformation in the command palette using category/name labels. */
  private registerTransformationCommands(): void {
    Object.entries(transformations).forEach(([transformationId, transformation]) => {
      // Keep the original command id so existing hotkeys continue to work;
      // it is registered above with the same categorized name.
      if (transformationId === "boldToHighlight") {
        return;
      }
      const category = transformation.category || "Text Cleanup";
      this.addCommand({
        id: `transform-${transformationId}`,
        name: `${category} / ${this.friendlyTransformationName(transformation.name)}`,
        editorCallback: (editor) => this.applyTransformationToEditor(editor, transformationId),
      });
    });

    this.addCommand({
      id: "ai-classify-current-note",
      name: "AI / Classify current note folder",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== "md") {
          return false;
        }
        if (!checking) {
          void diagnostics.guard("main.background_25", () => (this.classifyFile(file)));
        }
        return true;
      },
    });

    this.addCommand({
      id: "report-weak-titles-current-folder",
      name: "Markdown Notes / Find weak titles in current folder",
      checkCallback: (checking) => {
        const folder = this.app.workspace.getActiveFile()?.parent;
        if (!(folder instanceof TFolder)) {
          return false;
        }
        if (!checking) {
          void diagnostics.guard("main.background_26", () => (this.createWeakTitlesReport(folder)));
        }
        return true;
      },
    });

    this.addCommand({
      id: "report-duplicate-notes-current-folder",
      name: "Markdown Notes / Find duplicate notes in current folder",
      checkCallback: (checking) => {
        const folder = this.app.workspace.getActiveFile()?.parent;
        if (!(folder instanceof TFolder)) {
          return false;
        }
        if (!checking) {
          void diagnostics.guard("main.background_27", () => (this.createDuplicateNotesReport(folder)));
        }
        return true;
      },
    });
  }

  onunload(): void {
return diagnostics.guard("main.onunload_28", () => {
const diagnosticAction9 = () => {

    this.logger.info("Plugin.onunload", "Plugin is unloading.");

}; return diagnostics?.run ? diagnostics.run("main.onunload", diagnosticAction9) : diagnosticAction9();

});
}

  private startProcessingNotice(label: string): ProcessingNotice {
    const startedAt = Date.now();
    const abortController = new AbortController();
    let cancelled = false;
    const fragment = document.createDocumentFragment();
    const message = document.createElement("span");
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.style.marginLeft = "10px";
    cancelButton.onclick = diagnostics.wrap("main.dom_1", () => {
      cancelled = true;
      abortController.abort();
      message.textContent = `${label} cancelled.`;
    });
    fragment.append(message, cancelButton);
    const notice = new Notice(fragment, 0);
    const update = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      message.textContent = `${label}... ${elapsedSeconds} second(s) elapsed.`;
    };
    update();
    const intervalId = window.setInterval(diagnostics.wrap("main.timer_29", update), 1000);

    return {
      abortSignal: abortController.signal,
      throwIfCancelled: () => {
        if (cancelled || abortController.signal.aborted) {
          throw new Error("Operation cancelled.");
        }
      },
      wasCancelled: () => cancelled || abortController.signal.aborted,
      close: () => {
        window.clearInterval(intervalId);
        notice.hide();
      },
    };
  }

  private async estimateFolderCharacters(files: TFile[]): Promise<string> {
    const counts = await Promise.allSettled(files.map(async (file) => (await this.app.vault.cachedRead(file)).length));
    let total = 0;
    let unreadable = 0;
    for (const result of counts) {
      if (result.status === "fulfilled") total += Math.max(1, result.value);
      else unreadable++;
    }
    return `Estimated usage: ${unreadable ? "at least " : ""}${total.toLocaleString()} characters${unreadable ? ` (${unreadable} unreadable file(s))` : ""}. Final usage follows the text processed.`;
  }

  private queueAiTask(label: string, submittedText: string, run: () => Promise<void>): void {
    void diagnostics.guard("main.background_30", () => (this.aiQueue.enqueue(label, submittedText, async (report) => {
const diagnosticEnd10 = diagnostics?.start?.("main.background.17435") ?? (() => {});
try {

      this.queueReporter = report;
      report({ label: "Preparing AI request", submittedText });
      try { await run(); }
      finally { this.queueReporter = undefined; }

} catch (diagnosticError10) { diagnostics?.failure?.("main.background.17435", diagnosticError10); throw diagnosticError10; } finally { diagnosticEnd10(); }
})));
  }

  private friendlyTransformationName(name: string): string {
    return name.replace(/^AI /, "").replace(/^Remove AI /, "Remove ");
  }

  private getTransformationMenuTitle(transformation: { name: string; usesFullText?: boolean }): string {
    return `${this.friendlyTransformationName(transformation.name)}${transformation.usesFullText ? " (Full Text)" : ""}`;
  }

  private formatCompactNumber(value: number): string {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
    }
    return String(value);
  }

  private formatAiUsage(usage: AiUsageSummary): string {
    const tokenText = usage.totalTokens > 0 ? this.formatCompactNumber(usage.totalTokens) : "unknown";
    const requestText = usage.requests === 1 ? "1 request" : `${usage.requests} requests`;
    return `AI usage: ${tokenText} tokens (${requestText}, ${this.formatCompactNumber(usage.inputChars)} input characters, ${this.formatCompactNumber(usage.outputChars)} output characters)`;
  }

  private showAiUsage(label: string, usage: AiUsageSummary): void {
    if (usage.requests === 0) {
      return;
    }

    const message = `${label}. ${this.formatAiUsage(usage)}`;
    new Notice(message, 3000);
    this.logger.info("AI usage", message, usage);

    if (usage.inputChars > 1000) {
      const ratio = usage.inputChars > 0 ? usage.outputChars / usage.inputChars : 1;
      if (ratio < 0.55 || ratio > 1.8) {
        this.logger.warn("AI usage", `Suspicious character delta for ${label}. inputChars=${usage.inputChars} outputChars=${usage.outputChars} ratio=${ratio.toFixed(3)}`);
      }
    }
  }

  /**
   * Charges input characters for a single AI call (minimum one). Claims the
   * account free allowance first, then spends purchased characters. Returns false
   * (and shows a Notice) when authentication, balance, or spend verification
   * is unavailable. AI work never proceeds without an authoritative charge.
   */
  async chargeCharacters(charCount: number): Promise<boolean> {
const diagnosticEnd11 = diagnostics?.start?.("main.chargeCharacters") ?? (() => {});
try {

    const cost = Math.max(1, Math.ceil(charCount));
    if (!this.settings.billingRefreshToken || !this.settings.billingAccountLinked) {
      new Notice("Torbert: sign in or create an account in plugin settings before running AI.");
      return false;
    }
    await retryPendingSpendEvents(this);
    if (this.settings.pendingSpendEvents.length > 0) {
      new Notice("Torbert: a previous charge is still being confirmed. Please retry when the connection is restored.");
      return false;
    }
    const stableEventId = `consume_${generateEventId()}`;
    this.settings.pendingSpendEvents.push({ eventId: stableEventId, amount: cost });
    await this.saveSettings();
    const result = await spendConstanceCredits(this, cost, stableEventId);
    if (result.kind === "ok") {
      this.settings.purchasedCharacters = result.balance;
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      await this.saveSettings();
      return true;
    }
    if (result.kind === "insufficient") {
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      await this.saveSettings();
      new Notice("Torbert: out of characters. View the current character offers in plugin settings.");
      return false;
    }

    this.logger.warn("chargeCharacters", "A previous charge is awaiting confirmation. The AI request will wait until it is confirmed.");
    new Notice("Torbert: your account could not be verified. Retry after the connection is restored.");
    return false;

} catch (diagnosticError11) { diagnostics?.failure?.("main.chargeCharacters", diagnosticError11); throw diagnosticError11; } finally { diagnosticEnd11(); }
}

  /** Preview and apply a transformation to the active editor or current selection. */
  async applyTransformationToEditor(editor: Editor | null, transformationId: TransformationId, queued = false): Promise<void> {
const diagnosticEnd12 = diagnostics?.start?.("main.applyTransformationToEditor") ?? (() => {});
try {

    let processingNotice: ProcessingNotice | null = null;
    try {
      const targetEditor = editor || this.app.workspace.activeEditor?.editor;

      if (!targetEditor) {
        new Notice("Open a note in the editor first.");
        return;
      }

      const transformation = transformations[transformationId];
      if (!transformation) {
        return;
      }

      const selection = targetEditor.getSelection();
      if (transformation.requiresSelection && !selection) {
        new Notice("This command requires a text selection.");
        return;
      }

      // Preserve the original plugin behavior: selected text wins; otherwise
      // transform the full active editor contents.
      const textToTransform = selection || targetEditor.getValue();
      if (transformation.requiresAi && !queued) {
        this.queueAiTask(transformation.name, textToTransform, () => this.applyTransformationToEditor(editor, transformationId, true));
        return;
      }
      if (transformation.requiresAi) this.queueReporter?.({ label: `Processing ${transformation.name}`, submittedText: textToTransform });
      if (transformation.requiresAi && !(await checkCharactersAvailable(this, textToTransform.length))) return;
      processingNotice = this.startProcessingNotice(`Processing ${transformation.name}`);
      const abortSignal = processingNotice.abortSignal;
      const { result: transformationResult, usage } = await collectAiUsageDuring(() => Promise.resolve(transformation.transform(textToTransform, { settings: this.settings, abortSignal })));
      const { newText, noticeText } = transformationResult;

      if (newText !== textToTransform && this.settings.reviewBeforeApply) {
        new BatchPreviewModal(
          this.app,
          `Review ${transformation.name}`,
          [{
            label: selection ? "Current selection" : "Current note",
            detail: summarizeTextChange(textToTransform, newText),
          }],
          () => {
            void diagnostics.guard("main.background_31", () => ((async () => {
const diagnosticEnd13 = diagnostics?.start?.("main.background.23572") ?? (() => {});
try {

              try {
                const currentText = selection ? targetEditor.getSelection() : targetEditor.getValue();
                if (currentText !== textToTransform) {
                  new Notice("The text changed while the preview was open. Review the change again.");
                  return;
                }
                if (transformation.requiresAi && !(await this.chargeCharacters(textToTransform.length))) {
                  return;
                }
                await this.recordEditorSnapshot(`Editor: ${transformation.name}`, targetEditor);
                if (selection) {
                  targetEditor.replaceSelection(newText);
                } else {
                  targetEditor.setValue(newText);
                }
                new Notice(noticeText);
                this.showAiUsage(transformation.name, usage);
                this.logger.info("applyTransformationToEditor", `Applied '${transformationId}'. Notice: ${noticeText}`);
              } catch (error) {
diagnostics.failure("main.caught_32", error);
                this.logger.error("applyTransformationToEditor", `Failed to apply '${transformationId}' after preview`, error);
                new Notice("Error applying the reviewed change. The original text was kept.");
              }

} catch (diagnosticError13) { diagnostics?.failure?.("main.background.23572", diagnosticError13); throw diagnosticError13; } finally { diagnosticEnd13(); }
})()));
          },
        ).open();
        return;
      }

      if (newText !== textToTransform) {
        const currentText = selection ? targetEditor.getSelection() : targetEditor.getValue();
        if (currentText !== textToTransform) { new Notice("The text changed while processing. Run the transformation again."); return; }
        if (transformation.requiresAi && !(await this.chargeCharacters(textToTransform.length))) return;
        await this.recordEditorSnapshot(`Editor: ${transformation.name}`, targetEditor);
      }
      if (selection) {
        targetEditor.replaceSelection(newText);
      } else {
        targetEditor.setValue(newText);
      }

      if (!processingNotice.wasCancelled()) {
        new Notice(noticeText);
        this.showAiUsage(transformation.name, usage);
      }
      this.logger.info("applyTransformationToEditor", `Applied '${transformationId}'. Notice: ${noticeText}`);

    } catch (error) {
diagnostics.failure("main.caught_33", error);
      this.logger.error("applyTransformationToEditor", `Failed to apply '${transformationId}'`, error);
      new Notice(processingNotice?.wasCancelled() ? "Operation cancelled." : "The transformation could not be applied. Try again or copy the diagnostic log for support.");
    } finally {
      processingNotice?.close();
    }

} catch (diagnosticError12) { diagnostics?.failure?.("main.applyTransformationToEditor", diagnosticError12); throw diagnosticError12; } finally { diagnosticEnd12(); }
}

  /** Preview and apply one transformation to a single Markdown file. */
  async applyTransformationToFile(file: TFile, transformationId: TransformationId, queued = false): Promise<void> {
const diagnosticEnd14 = diagnostics?.start?.("main.applyTransformationToFile") ?? (() => {});
try {

    let processingNotice: ProcessingNotice | null = null;
    try {
      const transformation = transformations[transformationId];
      if (!transformation) {
        return;
      }

      const fileContents = await this.app.vault.read(file);
      if (transformation.requiresAi && !queued) {
        this.queueAiTask(`${transformation.name} on ${file.name}`, fileContents, () => this.applyTransformationToFile(file, transformationId, true));
        return;
      }
      if (transformation.requiresAi) this.queueReporter?.({ label: `Processing ${file.name}`, submittedText: fileContents });
      processingNotice = this.startProcessingNotice(`Processing ${file.name}`);
      const abortSignal = processingNotice.abortSignal;
      const { result: transformationResult, usage } = await collectAiUsageDuring(() => Promise.resolve(transformation.transform(fileContents, { settings: this.settings, abortSignal })));
      const { newText, noticeText } = transformationResult;

      if (newText !== fileContents && this.settings.reviewBeforeApply) {
        new BatchPreviewModal(
          this.app,
          `Review ${transformation.name}`,
          [{ label: file.path, detail: summarizeTextChange(fileContents, newText) }],
          () => {
            void diagnostics.guard("main.background_34", () => ((async () => {
const diagnosticEnd15 = diagnostics?.start?.("main.background.27554") ?? (() => {});
try {

              try {
                const currentContents = await this.app.vault.read(file);
                if (currentContents !== fileContents) {
                  new Notice(`The note changed while the preview was open. Review ${file.name} again.`);
                  return;
                }
                if (transformation.requiresAi && !(await this.chargeCharacters(fileContents.length))) {
                  return;
                }
                await this.recordOperation(`File: ${transformation.name}`, [{
                  path: file.path,
                  content: fileContents,
                }]);
                await this.app.vault.modify(file, newText);
                new Notice(`${noticeText} in ${file.name}`);
                this.showAiUsage(`${transformation.name} on ${file.name}`, usage);
                this.logger.info("applyTransformationToFile", `Applied '${transformationId}' to ${file.path}.`);
              } catch (error) {
diagnostics.failure("main.caught_35", error);
                this.logger.error("applyTransformationToFile", `Failed to apply '${transformationId}' after preview`, error);
                new Notice(`Error applying the reviewed change to ${file.name}. The original text was kept.`);
              }

} catch (diagnosticError15) { diagnostics?.failure?.("main.background.27554", diagnosticError15); throw diagnosticError15; } finally { diagnosticEnd15(); }
})()));
          },
        ).open();
        return;
      }

      if (newText !== fileContents) {
        const currentContents = await this.app.vault.read(file);
        if (currentContents !== fileContents) { new Notice(`The note changed while processing. Run ${transformation.name} again.`); return; }
        if (transformation.requiresAi && !(await this.chargeCharacters(fileContents.length))) return;
        await this.recordOperation(`File: ${transformation.name}`, [{ path: file.path, content: fileContents }]);
        await this.app.vault.modify(file, newText);
      }

      if (!processingNotice.wasCancelled()) {
        new Notice(`${noticeText} in ${file.name}`);
        this.showAiUsage(`${transformation.name} on ${file.name}`, usage);
      }
      this.logger.info("applyTransformationToFile", `Applied '${transformationId}' to ${file.path}.`);

    } catch (error) {
diagnostics.failure("main.caught_36", error);
      this.logger.error("applyTransformationToFile", `Failed to apply '${transformationId}' to file ${file.path}`, error);
      new Notice(processingNotice?.wasCancelled() ? "Operation cancelled." : `Could not process ${file.name}. Try again or copy the diagnostic log for support.`);
    } finally {
      processingNotice?.close();
    }

} catch (diagnosticError14) { diagnostics?.failure?.("main.applyTransformationToFile", diagnosticError14); throw diagnosticError14; } finally { diagnosticEnd14(); }
}

  /** Preview a folder batch, then process files with cancellation and progress. */
  async applyTransformationToFolder(folder: TFolder, transformationId: TransformationId, queued = false, selected?: TFile[]): Promise<void> {
const diagnosticEnd16 = diagnostics?.start?.("main.applyTransformationToFolder") ?? (() => {});
try {

    let processingNotice: ProcessingNotice | null = null;
    try {
      const files = selected ?? this.getMarkdownFilesInFolder(folder);

      if (files.length === 0) {
        new Notice(`No Markdown files found in ${folder.name}.`);
        return;
      }

      if (transformations[transformationId]?.requiresAi && !queued) {
        const estimate = await this.estimateFolderCharacters(files);
        new Notice(estimate, 8000);
        this.queueAiTask(`${transformations[transformationId]?.name || transformationId} in ${folder.name}`, `Folder: ${folder.path}\n${files.length} Markdown file(s)\n${estimate}`, () => this.applyTransformationToFolder(folder, transformationId, true, selected));
        return;
      }

      processingNotice = this.startProcessingNotice(`Processing ${files.length} file(s) with ${transformations[transformationId]?.name || transformationId}`);

      const snapshots: OperationHistorySnapshot[] = [];
      const pendingWrites: Array<{ file: TFile; oldText: string; newText: string }> = [];
      let processedCount = 0;
      let failedCount = 0;
      for (const file of files) {
        try {
          processingNotice.throwIfCancelled();
          const transformation = transformations[transformationId];
          if (!transformation) {
            return;
          }

          const fileContents = await this.app.vault.read(file);
          if (transformation.requiresAi) this.queueReporter?.({ label: `Processing ${file.name}`, submittedText: fileContents, current: processedCount + 1, total: files.length });
          if (transformation.requiresAi && !(await this.chargeCharacters(fileContents.length))) {
            this.logger.info("applyTransformationToFolder", "Out of characters; stopped the batch.");
            break;
          }

          const abortSignal = processingNotice.abortSignal;
          const { result: transformationResult, usage } = await collectAiUsageDuring(() => Promise.resolve(transformation.transform(fileContents, { settings: this.settings, abortSignal })));
          const { newText } = transformationResult;
          this.showAiUsage(`${transformation.name} on ${file.name}`, usage);

          if (newText !== fileContents) {
            snapshots.push({
              path: file.path,
              content: fileContents,
            });
            pendingWrites.push({ file, oldText: fileContents, newText });
          }

          processedCount++;
        } catch (error) {
diagnostics.failure("main.caught_37", error);
          failedCount++;
          this.logger.error("applyTransformationToFolder", `Failed '${transformationId}' on ${file.path}`, error);
        }
      }

      if (pendingWrites.length > 0 && this.settings.reviewBeforeApply) {
        const previewItems = pendingWrites.map((item) => ({
          label: item.file.path,
          detail: summarizeTextChange(item.oldText, item.newText),
        }));
        new BatchPreviewModal(this.app, `Review ${transformations[transformationId]?.name || transformationId}`, previewItems, () => {
          void diagnostics.guard("main.background_38", () => (this.applyPendingFolderWrites(folder, transformationId, pendingWrites, snapshots, processedCount, failedCount)));
        }).open();
        return;
      }

      if (pendingWrites.length > 0) await this.applyPendingFolderWrites(folder, transformationId, pendingWrites, snapshots, processedCount, failedCount);

      const failureText = failedCount > 0 ? ` ${failedCount} file(s) failed.` : "";
      new Notice(`Applied to ${processedCount} Markdown file(s) in ${folder.name}.${failureText}`);
      this.logger.info("applyTransformationToFolder", `Applied '${transformationId}' to ${processedCount} file(s) in ${folder.path}. Failed: ${failedCount}.`);

    } catch (error) {
diagnostics.failure("main.caught_39", error);
      this.logger.error("applyTransformationToFolder", `Failed to apply '${transformationId}' to folder ${folder.path}`, error);
      new Notice(processingNotice?.wasCancelled() ? "Operation cancelled." : `Could not process ${folder.name}. Try again or copy the diagnostic log for support.`);
    } finally {
      processingNotice?.close();
    }

} catch (diagnosticError16) { diagnostics?.failure?.("main.applyTransformationToFolder", diagnosticError16); throw diagnosticError16; } finally { diagnosticEnd16(); }
}

  private async applyPendingFolderWrites(
    folder: TFolder,
    transformationId: TransformationId,
    pendingWrites: Array<{ file: TFile; oldText: string; newText: string }>,
    snapshots: OperationHistorySnapshot[],
    processedCount: number,
    failedCount: number,
  ): Promise<void> {
const diagnosticEnd17 = diagnostics?.start?.("main.applyPendingFolderWrites") ?? (() => {});
try {

    const processingNotice = this.startProcessingNotice(`Applying ${pendingWrites.length} file update(s)`);
    const reportItems: BatchReportItem[] = [];

    try {
      if (snapshots.length > 0) {
        processingNotice.throwIfCancelled();
        await this.recordOperation(`Folder: ${transformations[transformationId]?.name || transformationId}`, snapshots);
      }

      for (const pendingWrite of pendingWrites) {
        try {
          processingNotice.throwIfCancelled();
          const currentContents = await this.app.vault.read(pendingWrite.file);
          if (currentContents !== pendingWrite.oldText) {
            failedCount++;
            reportItems.push({ path: pendingWrite.file.path, status: "failed", message: "changed since preview" });
            continue;
          }
          await this.app.vault.modify(pendingWrite.file, pendingWrite.newText);
          reportItems.push({ path: pendingWrite.file.path, status: "changed", message: transformations[transformationId]?.name || transformationId });
        } catch (error) {
diagnostics.failure("main.caught_40", error);
          failedCount++;
          reportItems.push({ path: pendingWrite.file.path, status: "failed", message: String(error) });
          this.logger.error("applyPendingFolderWrites", `Failed '${transformationId}' on ${pendingWrite.file.path}`, error);
        }
      }

      await this.createBatchReport(`Folder ${transformations[transformationId]?.name || transformationId}`, folder.path, reportItems);
      const failureText = failedCount > 0 ? ` ${failedCount} file(s) failed.` : "";
      new Notice(`Applied to ${processedCount} Markdown file(s) in ${folder.name}.${failureText}`);

    } catch (error) {
diagnostics.failure("main.caught_41", error);
      this.logger.error("applyPendingFolderWrites", `Cancelled or failed applying '${transformationId}' in ${folder.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying changes in ${folder.name}.`);
    } finally {
      processingNotice.close();
    }

} catch (diagnosticError17) { diagnostics?.failure?.("main.applyPendingFolderWrites", diagnosticError17); throw diagnosticError17; } finally { diagnosticEnd17(); }
}

  private getMarkdownFilesInFolder(folder: TFolder): TFile[] {
    if (folder.name === GENERATED_REPORT_FOLDER_NAME) {
      return [];
    }

    return folder.children.flatMap((child) => {
      if (child instanceof TFile) {
        return child.extension === "md" ? [child] : [];
      }

      if (child instanceof TFolder) {
        return this.getMarkdownFilesInFolder(child);
      }

      return [];
    });
  }

  async classifyFile(file: TFile): Promise<void> {
const diagnosticEnd18 = diagnostics?.start?.("main.classifyFile") ?? (() => {});
try {

    await this.classifyFiles([file], file.parent?.path || "");

} catch (diagnosticError18) { diagnostics?.failure?.("main.classifyFile", diagnosticError18); throw diagnosticError18; } finally { diagnosticEnd18(); }
}

  async classifyFilesInFolder(folder: TFolder): Promise<void> {
const diagnosticEnd19 = diagnostics?.start?.("main.classifyFilesInFolder") ?? (() => {});
try {

    const files = this.getMarkdownFilesInFolder(folder);
    if (files.length === 0) {
      new Notice(`No Markdown files found in ${folder.name}.`);
      return;
    }

    await this.classifyFiles(files, folder.path);

} catch (diagnosticError19) { diagnostics?.failure?.("main.classifyFilesInFolder", diagnosticError19); throw diagnosticError19; } finally { diagnosticEnd19(); }
}

  private async classifyFiles(files: TFile[], sourcePath: string, queued = false): Promise<void> {
const diagnosticEnd20 = diagnostics?.start?.("main.classifyFiles") ?? (() => {});
try {

    if (!queued) {
      const estimate = await this.estimateFolderCharacters(files);
      new Notice(estimate, 8000);
      this.queueAiTask(`AI folder classification (${files.length} file${files.length === 1 ? "" : "s"})`, `Source: ${sourcePath || "current note"}\n${files.length} Markdown file(s)\n${estimate}`, () => this.classifyFiles(files, sourcePath, true));
      return;
    }
    const processingNotice = this.startProcessingNotice(`Processing AI classification for ${files.length} file(s)`);
    const folderChoices = parseFolderList(this.settings.folderClassificationFolders);
    const movePlan: Array<{ file: TFile; newPath: string }> = [];
    const snapshots: OperationHistorySnapshot[] = [];
    const reservedPaths = new Set<string>();
    let failedCount = 0;

    try {
      for (const file of files) {
        try {
          processingNotice.throwIfCancelled();
          const fileContents = await this.app.vault.read(file);
          this.queueReporter?.({ label: `Classifying ${file.name}`, submittedText: fileContents, current: failedCount + 1, total: files.length });
          if (!(await this.chargeCharacters(fileContents.length))) {
            this.logger.info("classifyFiles", "Out of characters; stopped the batch.");
            break;
          }
          const { result: rawFolderName, usage } = await collectAiUsageDuring(() => classifyFolderFromContent(this.settings, folderChoices, fileContents, processingNotice.abortSignal));
          const folderName = sanitizeFolderName(rawFolderName);
          this.showAiUsage(`AI Classify Folder on ${file.name}`, usage);
          const desiredPath = folderName ? `${folderName}/${file.name}` : file.name;
          if (desiredPath === file.path) {
            continue;
          }
          const newPath = await this.getAvailablePathInFolder(folderName, file.name, reservedPaths);

          if (newPath !== file.path) {
            reservedPaths.add(newPath);
            movePlan.push({ file, newPath });
            snapshots.push({ path: file.path, currentPath: newPath, content: fileContents });
          }
        } catch (error) {
diagnostics.failure("main.caught_42", error);
          failedCount++;
          this.logger.error("classifyFiles", `Failed to classify ${file.path}`, error);
        }
      }
    } catch (error) {
diagnostics.failure("main.caught_43", error);
      this.logger.error("classifyFiles", `Cancelled or failed classification for ${sourcePath}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : "Error classifying files.");
      return;
    } finally {
      processingNotice.close();
    }

    if (movePlan.length === 0) {
      new Notice(`No classified moves suggested.${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
      return;
    }

    if (!this.settings.reviewBeforeApply) { await this.applyMovePlan("AI Folder Classification", sourcePath, movePlan, snapshots, failedCount); return; }
    new BatchPreviewModal(this.app, "AI Classify Folder", movePlan.map((item) => ({
      label: item.file.path,
      detail: `Proposed path: ${item.newPath}`,
    })), () => {
      void diagnostics.guard("main.background_44", () => (this.applyMovePlan("AI Folder Classification", sourcePath, movePlan, snapshots, failedCount)));
    }).open();

} catch (diagnosticError20) { diagnostics?.failure?.("main.classifyFiles", diagnosticError20); throw diagnosticError20; } finally { diagnosticEnd20(); }
}

  private async applyMovePlan(
    label: string,
    sourcePath: string,
    movePlan: Array<{ file: TFile; newPath: string }>,
    snapshots: OperationHistorySnapshot[],
    failedCount: number,
  ): Promise<void> {
const diagnosticEnd21 = diagnostics?.start?.("main.applyMovePlan") ?? (() => {});
try {

    const processingNotice = this.startProcessingNotice(`Applying ${movePlan.length} move(s)`);
    const reportItems: BatchReportItem[] = [];
    let movedCount = 0;

    try {
      if (snapshots.length > 0) {
        await this.recordOperation(label, snapshots);
      }

      for (const item of movePlan) {
        try {
          processingNotice.throwIfCancelled();
          const oldPath = item.file.path;
          await this.ensureFolderPath(item.newPath.split("/").slice(0, -1).join("/"));
          await this.app.vault.rename(item.file, item.newPath);
          movedCount++;
          reportItems.push({ path: oldPath, newPath: item.newPath, status: "moved" });
        } catch (error) {
diagnostics.failure("main.caught_45", error);
          failedCount++;
          reportItems.push({ path: item.file.path, newPath: item.newPath, status: "failed", message: String(error) });
          this.logger.error("applyMovePlan", `Failed to move ${item.file.path} to ${item.newPath}`, error);
        }
      }

      await this.createBatchReport(label, sourcePath, reportItems);
      new Notice(`Moved ${movedCount} file(s).${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
    } catch (error) {
diagnostics.failure("main.caught_46", error);
      this.logger.error("applyMovePlan", `Cancelled or failed move plan for ${sourcePath}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : "Error applying move plan.");
    } finally {
      processingNotice.close();
    }

} catch (diagnosticError21) { diagnostics?.failure?.("main.applyMovePlan", diagnosticError21); throw diagnosticError21; } finally { diagnosticEnd21(); }
}

  async createWeakTitlesReport(folder: TFolder): Promise<void> {
const diagnosticEnd22 = diagnostics?.start?.("main.createWeakTitlesReport") ?? (() => {});
try {

    const processingNotice = this.startProcessingNotice(`Creating weak title report for ${folder.name}`);
    try {
      const items: string[] = [];
      for (const file of this.getMarkdownFilesInFolder(folder)) {
        processingNotice.throwIfCancelled();
        if (!isWeakTitle(file.basename)) {
          continue;
        }

        items.push(`- ${file.path}`);
      }

      const body = [
        "# Weak Titles",
        "",
        `Source folder: ${folder.path}`,
        `Created: ${new Date().toISOString()}`,
        "",
        items.length > 0 ? items.join("\n") : "No weak titles found.",
      ].filter(Boolean).join("\n");
      const reportPath = await this.createReportNote(folder.path, "weak-titles", body);
      new Notice(`Weak title report created: ${reportPath}`);
    } catch (error) {
diagnostics.failure("main.caught_47", error);
      this.logger.error("createWeakTitlesReport", `Failed to create report for ${folder.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error creating weak title report for ${folder.name}.`);
    } finally {
      processingNotice.close();
    }

} catch (diagnosticError22) { diagnostics?.failure?.("main.createWeakTitlesReport", diagnosticError22); throw diagnosticError22; } finally { diagnosticEnd22(); }
}

  async createDuplicateNotesReport(folder: TFolder): Promise<void> {
const diagnosticEnd23 = diagnostics?.start?.("main.createDuplicateNotesReport") ?? (() => {});
try {

    const processingNotice = this.startProcessingNotice(`Creating duplicate note report for ${folder.name}`);
    try {
      const files = this.getMarkdownFilesInFolder(folder);
      const readResults = await Promise.allSettled(files.map(async (file) => { const diagnosticEnd24 = diagnostics?.start?.("main.background.43557") ?? (() => {}); try { return await (({ file, content: await this.app.vault.read(file) })); } catch (diagnosticError24) { diagnostics?.failure?.("main.background.43557", diagnosticError24); throw diagnosticError24; } finally { diagnosticEnd24(); } }));
      const contents = readResults
        .filter((result): result is PromiseFulfilledResult<{ file: TFile; content: string }> => result.status === "fulfilled")
        .map((result) => result.value);
      const failedCount = readResults.length - contents.length;
      const items: string[] = [];

      for (let leftIndex = 0; leftIndex < contents.length; leftIndex++) {
        processingNotice.throwIfCancelled();
        for (let rightIndex = leftIndex + 1; rightIndex < contents.length; rightIndex++) {
          processingNotice.throwIfCancelled();
          const similarity = noteSimilarity(contents[leftIndex].content, contents[rightIndex].content);
          if (similarity >= 0.82) {
            items.push(`- ${Math.round(similarity * 100)}% similar: ${contents[leftIndex].file.path} <-> ${contents[rightIndex].file.path}. Suggested action: compare, merge unique content, then remove or archive one copy.`);
          }
        }
      }

      const body = [
        "# Duplicate Note Detection",
        "",
        `Source folder: ${folder.path}`,
        `Created: ${new Date().toISOString()}`,
        "",
        items.length > 0 ? items.join("\n") : "No likely duplicate notes found.",
        failedCount > 0 ? `\nFailed files: ${failedCount}` : "",
      ].filter(Boolean).join("\n");
      const reportPath = await this.createReportNote(folder.path, "duplicate-note-detection", body);
      new Notice(`Duplicate note report created: ${reportPath}`);
    } catch (error) {
diagnostics.failure("main.caught_48", error);
      this.logger.error("createDuplicateNotesReport", `Failed to create report for ${folder.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error creating duplicate note report for ${folder.name}.`);
    } finally {
      processingNotice.close();
    }

} catch (diagnosticError23) { diagnostics?.failure?.("main.createDuplicateNotesReport", diagnosticError23); throw diagnosticError23; } finally { diagnosticEnd23(); }
}

  async applyCustomPromptToFile(file: TFile, preset: CustomPromptPreset, queued = false): Promise<void> {
const diagnosticEnd25 = diagnostics?.start?.("main.applyCustomPromptToFile") ?? (() => {});
try {

    if (!queued) {
      const contents = await this.app.vault.read(file);
      this.queueAiTask(`Prompt ${preset.name} on ${file.name}`, contents, () => this.applyCustomPromptToFile(file, preset, true));
      return;
    }
    const processingNotice = this.startProcessingNotice(`Processing prompt for ${file.name}`);
    try {
      const fileContents = await this.app.vault.read(file);
      this.queueReporter?.({ label: `Sending prompt for ${file.name}`, submittedText: fileContents });
      if (!(await this.chargeCharacters(fileContents.length))) {
        return;
      }
      const { result: newText, usage } = await collectAiUsageDuring(() => rewriteWithOpenAi(this.settings, preset.prompt, fileContents, processingNotice.abortSignal));

      if (newText !== fileContents && this.settings.reviewBeforeApply) {
        new BatchPreviewModal(
          this.app,
          `Review prompt: ${preset.name}`,
          [{ label: file.path, detail: summarizeTextChange(fileContents, newText) }],
          () => {
            void diagnostics.guard("main.background_49", () => ((async () => {
const diagnosticEnd26 = diagnostics?.start?.("main.background.46578") ?? (() => {});
try {

              try {
                const currentContents = await this.app.vault.read(file);
                if (currentContents !== fileContents) {
                  new Notice(`The note changed while the preview was open. Review ${file.name} again.`);
                  return;
                }
                await this.recordOperation(`Prompt: ${preset.name}`, [{ path: file.path, content: fileContents }]);
                await this.app.vault.modify(file, newText);
                new Notice(`Applied prompt preset to ${file.name}.`);
                this.showAiUsage(`Prompt ${preset.name} on ${file.name}`, usage);
              } catch (error) {
diagnostics.failure("main.caught_50", error);
                this.logger.error("applyCustomPromptToFile", `Failed prompt '${preset.name}' after preview`, error);
                new Notice(`Error applying the reviewed change to ${file.name}. The original text was kept.`);
              }

} catch (diagnosticError26) { diagnostics?.failure?.("main.background.46578", diagnosticError26); throw diagnosticError26; } finally { diagnosticEnd26(); }
})()));
          },
        ).open();
        return;
      }

      if (newText !== fileContents) {
        const currentContents = await this.app.vault.read(file);
        if (currentContents !== fileContents) { new Notice(`The note changed while processing. Run the prompt again.`); return; }
        await this.recordOperation(`Prompt: ${preset.name}`, [{ path: file.path, content: fileContents }]);
        await this.app.vault.modify(file, newText);
      }

      if (!processingNotice.wasCancelled()) {
        new Notice(`Applied prompt preset to ${file.name}.`);
        this.showAiUsage(`Prompt ${preset.name} on ${file.name}`, usage);
      }
    } catch (error) {
diagnostics.failure("main.caught_51", error);
      this.logger.error("applyCustomPromptToFile", `Failed prompt '${preset.name}' on ${file.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying prompt preset to ${file.name}.`);
    } finally {
      processingNotice.close();
    }

} catch (diagnosticError25) { diagnostics?.failure?.("main.applyCustomPromptToFile", diagnosticError25); throw diagnosticError25; } finally { diagnosticEnd25(); }
}

  async applyCustomPromptToFolder(folder: TFolder, preset: CustomPromptPreset, queued = false, selected?: TFile[]): Promise<void> {
const diagnosticEnd27 = diagnostics?.start?.("main.applyCustomPromptToFolder") ?? (() => {});
try {

    if (!queued) {
      const queuedFiles = selected ?? this.getMarkdownFilesInFolder(folder);
      const estimate = await this.estimateFolderCharacters(queuedFiles);
      new Notice(estimate, 8000);
      this.queueAiTask(`Prompt ${preset.name} in ${folder.name}`, `Folder: ${folder.path}\n${queuedFiles.length} Markdown file(s)\n${estimate}`, () => this.applyCustomPromptToFolder(folder, preset, true, selected));
      return;
    }
    let processingNotice: ProcessingNotice | null = null;
    const files = selected ?? this.getMarkdownFilesInFolder(folder);
    const pendingWrites: Array<{ file: TFile; oldText: string; newText: string }> = [];
    const snapshots: OperationHistorySnapshot[] = [];
    let failedCount = 0;

    try {
      processingNotice = this.startProcessingNotice(`Processing prompt for ${files.length} file(s)`);
      for (const file of files) {
        try {
          processingNotice.throwIfCancelled();
          const fileContents = await this.app.vault.read(file);
          this.queueReporter?.({ label: `Sending prompt for ${file.name}`, submittedText: fileContents, current: pendingWrites.length + failedCount + 1, total: files.length });
          if (!(await this.chargeCharacters(fileContents.length))) {
            this.logger.info("applyCustomPromptToFolder", "Out of characters; stopped the batch.");
            break;
          }
          const abortSignal = processingNotice.abortSignal;
          const { result: newText, usage } = await collectAiUsageDuring(() => rewriteWithOpenAi(this.settings, preset.prompt, fileContents, abortSignal));
          this.showAiUsage(`Prompt ${preset.name} on ${file.name}`, usage);

          if (newText !== fileContents) {
            snapshots.push({ path: file.path, content: fileContents });
            pendingWrites.push({ file, oldText: fileContents, newText });
          }
        } catch (error) {
diagnostics.failure("main.caught_52", error);
          failedCount++;
          this.logger.error("applyCustomPromptToFolder", `Failed prompt '${preset.name}' on ${file.path}`, error);
        }
      }
    } catch (error) {
diagnostics.failure("main.caught_53", error);
      this.logger.error("applyCustomPromptToFolder", `Cancelled or failed prompt '${preset.name}' in ${folder.path}`, error);
      new Notice(processingNotice?.wasCancelled() ? "Operation cancelled." : `Error applying prompt preset in ${folder.name}.`);
      return;
    } finally {
      processingNotice?.close();
    }

    if (pendingWrites.length === 0) {
      new Notice(`No prompt preset changes suggested.${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
      return;
    }

    if (!this.settings.reviewBeforeApply) { await this.applyCustomPromptFolderWrites(folder.path, preset, pendingWrites, snapshots, failedCount); return; }
    new BatchPreviewModal(this.app, `Review prompt: ${preset.name}`, pendingWrites.map((item) => ({
      label: item.file.path,
      detail: summarizeTextChange(item.oldText, item.newText),
    })), () => {
      void diagnostics.guard("main.background_54", () => (this.applyCustomPromptFolderWrites(folder.path, preset, pendingWrites, snapshots, failedCount)));
    }).open();

} catch (diagnosticError27) { diagnostics?.failure?.("main.applyCustomPromptToFolder", diagnosticError27); throw diagnosticError27; } finally { diagnosticEnd27(); }
}

  private async applyCustomPromptFolderWrites(
    sourcePath: string,
    preset: CustomPromptPreset,
    pendingWrites: Array<{ file: TFile; oldText: string; newText: string }>,
    snapshots: OperationHistorySnapshot[],
    failedCount: number,
  ): Promise<void> {
const diagnosticEnd28 = diagnostics?.start?.("main.applyCustomPromptFolderWrites") ?? (() => {});
try {

    const processingNotice = this.startProcessingNotice(`Applying prompt changes to ${pendingWrites.length} file(s)`);
    const reportItems: BatchReportItem[] = [];

    try {
      await this.recordOperation(`Prompt: ${preset.name}`, snapshots);
      for (const pendingWrite of pendingWrites) {
        try {
          processingNotice.throwIfCancelled();
          const currentContents = await this.app.vault.read(pendingWrite.file);
          if (currentContents !== pendingWrite.oldText) {
            failedCount++;
            reportItems.push({ path: pendingWrite.file.path, status: "failed", message: "changed since preview" });
            continue;
          }
          await this.app.vault.modify(pendingWrite.file, pendingWrite.newText);
          reportItems.push({ path: pendingWrite.file.path, status: "changed", message: preset.name });
        } catch (error) {
diagnostics.failure("main.caught_55", error);
          failedCount++;
          reportItems.push({ path: pendingWrite.file.path, status: "failed", message: String(error) });
        }
      }

      await this.createBatchReport(`Prompt ${preset.name}`, sourcePath, reportItems);
      new Notice(`Applied prompt preset to ${pendingWrites.length} file(s).${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
    } catch (error) {
diagnostics.failure("main.caught_56", error);
      this.logger.error("applyCustomPromptFolderWrites", `Cancelled or failed applying prompt '${preset.name}' in ${sourcePath}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying prompt changes.`);
    } finally {
      processingNotice.close();
    }

} catch (diagnosticError28) { diagnostics?.failure?.("main.applyCustomPromptFolderWrites", diagnosticError28); throw diagnosticError28; } finally { diagnosticEnd28(); }
}

  /** Restore the most recent saved operation snapshot after explicit confirmation. */
  async restoreLastOperation(): Promise<void> {
const diagnosticEnd29 = diagnostics?.start?.("main.restoreLastOperation") ?? (() => {});
try {

    const lastOperation = this.settings.operationHistory[0];

    if (!lastOperation) {
      new Notice("No Torbert Text AI changes to restore.");
      return;
    }

    const processingNotice = this.startProcessingNotice(`Restoring ${lastOperation.label}`);
    let restoredCount = 0;
    let failedCount = 0;

    try {
      for (const snapshot of [...lastOperation.snapshots].reverse()) {
        try {
          processingNotice.throwIfCancelled();
          if (snapshot.editorOnly) {
            const editor = this.app.workspace.activeEditor?.editor;
            if (!editor) {
              throw new Error("Open the original note in the editor to restore this change.");
            }
            editor.setValue(snapshot.content);
            restoredCount++;
            continue;
          }

          const currentPath = snapshot.currentPath || snapshot.path;
          const currentFile = this.app.vault.getAbstractFileByPath(currentPath);

          if (currentFile instanceof TFile) {
            await this.app.vault.modify(currentFile, snapshot.content);
            if (snapshot.currentPath && snapshot.currentPath !== snapshot.path) {
              await this.app.vault.rename(currentFile, snapshot.path);
            }
            restoredCount++;
            continue;
          }

          const originalFile = this.app.vault.getAbstractFileByPath(snapshot.path);
          if (originalFile instanceof TFile) {
            await this.app.vault.modify(originalFile, snapshot.content);
            restoredCount++;
            continue;
          }

          await this.app.vault.create(snapshot.path, snapshot.content);
          restoredCount++;
        } catch (error) {
diagnostics.failure("main.caught_57", error);
          failedCount++;
          this.logger.error("restoreLastOperation", `Failed to restore ${snapshot.path}`, error);
        }
      }
    } finally {
      processingNotice.close();
    }

    if (failedCount === 0) {
      this.settings.operationHistory = this.settings.operationHistory.slice(1);
      await this.saveSettings();
      new Notice(`Restored ${restoredCount} item(s) from ${lastOperation.label}.`);
      return;
    }

    new Notice(`Restore incomplete: ${restoredCount} item(s) restored and ${failedCount} failed. The operation remains available to retry.`);

} catch (diagnosticError29) { diagnostics?.failure?.("main.restoreLastOperation", diagnosticError29); throw diagnosticError29; } finally { diagnosticEnd29(); }
}

  private async recordEditorSnapshot(label: string, editor: Editor): Promise<void> {
const diagnosticEnd30 = diagnostics?.start?.("main.recordEditorSnapshot") ?? (() => {});
try {

    const activeFile = this.app.workspace.getActiveFile();

    if (activeFile) {
      await this.recordOperation(label, [{
        path: activeFile.path,
        content: editor.getValue(),
      }]);
      return;
    }

    await this.recordOperation(label, [{
      path: "__active_editor__",
      content: editor.getValue(),
      editorOnly: true,
    }]);

} catch (diagnosticError30) { diagnostics?.failure?.("main.recordEditorSnapshot", diagnosticError30); throw diagnosticError30; } finally { diagnosticEnd30(); }
}

  private async recordOperation(label: string, snapshots: OperationHistorySnapshot[]): Promise<void> {
const diagnosticEnd31 = diagnostics?.start?.("main.recordOperation") ?? (() => {});
try {

    if (snapshots.length === 0) {
      return;
    }

    const operation: OperationHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      createdAt: new Date().toISOString(),
      snapshots,
    };

    this.settings.operationHistory = [
      operation,
      ...(this.settings.operationHistory || []),
    ].slice(0, 20);
    await this.saveSettings();

} catch (diagnosticError31) { diagnostics?.failure?.("main.recordOperation", diagnosticError31); throw diagnosticError31; } finally { diagnosticEnd31(); }
}

  private async getAvailablePathInFolder(folderPath: string, fileName: string, reservedPaths = new Set<string>()): Promise<string> {
const diagnosticEnd32 = diagnostics?.start?.("main.getAvailablePathInFolder") ?? (() => {});
try {

    const cleanFolderPath = sanitizeFolderName(folderPath);
    const extension = ".md";
    const baseName = fileName.replace(/\.md$/i, "");
    const prefix = cleanFolderPath ? `${cleanFolderPath}/` : "";
    let candidatePath = `${prefix}${baseName}${extension}`;
    let suffix = 2;

    while (reservedPaths.has(candidatePath) || await this.app.vault.adapter.exists(candidatePath)) {
      candidatePath = `${prefix}${baseName}-${suffix}${extension}`;
      suffix++;
    }

    return await (candidatePath);

} catch (diagnosticError32) { diagnostics?.failure?.("main.getAvailablePathInFolder", diagnosticError32); throw diagnosticError32; } finally { diagnosticEnd32(); }
}

  private async ensureFolderPath(folderPath: string): Promise<void> {
const diagnosticEnd33 = diagnostics?.start?.("main.ensureFolderPath") ?? (() => {});
try {

    if (!folderPath) {
      return;
    }

    const parts = folderPath.split("/").filter(Boolean);
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!await this.app.vault.adapter.exists(currentPath)) {
        await this.app.vault.createFolder(currentPath);
      }
    }

} catch (diagnosticError33) { diagnostics?.failure?.("main.ensureFolderPath", diagnosticError33); throw diagnosticError33; } finally { diagnosticEnd33(); }
}

  private getCustomPromptPresets(): CustomPromptPreset[] {
    return (this.settings.customPromptPresets || [])
      .map((preset) => ({
        name: preset.name.trim(),
        prompt: preset.prompt.trim(),
      }))
      .filter((preset) => preset.name && preset.prompt);
  }

  private async createBatchReport(label: string, sourcePath: string, items: BatchReportItem[]): Promise<string> {
const diagnosticEnd34 = diagnostics?.start?.("main.createBatchReport") ?? (() => {});
try {

    const lines = [
      `# ${label} Report`,
      "",
      `Source: ${sourcePath || "/"}`,
      `Created: ${new Date().toISOString()}`,
      "",
      "Restore: use the command `Restore last Torbert Text AI change` for the latest recorded operation.",
      "",
      "## Results",
      "",
      ...items.map((item) => {
        const target = item.newPath ? ` -> ${item.newPath}` : "";
        const message = item.message ? ` (${item.message})` : "";
        return `- ${item.status}: ${item.path}${target}${message}`;
      }),
    ];

    return await (this.createReportNote(sourcePath, "torbert-batch-report", lines.join("\n")));

} catch (diagnosticError34) { diagnostics?.failure?.("main.createBatchReport", diagnosticError34); throw diagnosticError34; } finally { diagnosticEnd34(); }
}

  private async createReportNote(sourcePath: string, slug: string, content: string): Promise<string> {
const diagnosticEnd35 = diagnostics?.start?.("main.createReportNote") ?? (() => {});
try {

    const reportsFolder = sourcePath && sourcePath !== "/" ? `${sourcePath}/Torbert Reports` : "Torbert Reports";
    await this.ensureFolderPath(reportsFolder);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let path = `${reportsFolder}/${stamp}-${slug}.md`;
    let suffix = 2;

    while (await this.app.vault.adapter.exists(path)) {
      path = `${reportsFolder}/${stamp}-${slug}-${suffix}.md`;
      suffix++;
    }

    await this.app.vault.create(path, `${content.trim()}\n`);
    return await (path);

} catch (diagnosticError35) { diagnostics?.failure?.("main.createReportNote", diagnosticError35); throw diagnosticError35; } finally { diagnosticEnd35(); }
}

  async loadSettings(): Promise<void> {
const diagnosticEnd36 = diagnostics?.start?.("main.loadSettings") ?? (() => {});
try {

    const loadedSettings = await this.loadData();

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    this.settings.settingsMode = this.settings.settingsMode === "advanced" ? "advanced" : "simple";
    if (loadedSettings?.enabledTransformations) {
      this.settings.enabledTransformations = Object.assign(
        {},
        DEFAULT_SETTINGS.enabledTransformations,
        loadedSettings.enabledTransformations,
      );
    }


    this.settings.operationHistory = this.settings.operationHistory || [];
    this.settings.customPromptPresets = this.settings.customPromptPresets || DEFAULT_SETTINGS.customPromptPresets;
    this.settings.folderClassificationFolders = this.settings.folderClassificationFolders || DEFAULT_SETTINGS.folderClassificationFolders;
    this.settings.largeContentOpenAiModel = this.settings.largeContentOpenAiModel || DEFAULT_SETTINGS.largeContentOpenAiModel;
    this.settings.openAiApiBase = this.settings.openAiApiBase || DEFAULT_SETTINGS.openAiApiBase;
    this.settings.constanceDeviceId = this.settings.constanceDeviceId || "";
    this.settings.billingEmail = this.settings.billingEmail || "";
    this.settings.billingAccessToken = typeof this.settings.billingAccessToken === "string" ? this.settings.billingAccessToken : "";
    this.settings.billingRefreshToken = typeof this.settings.billingRefreshToken === "string" ? this.settings.billingRefreshToken : "";
    this.settings.billingTokenExpiresAt = Number(this.settings.billingTokenExpiresAt) || 0;
    this.settings.billingAccountLinked = this.settings.billingAccountLinked === true && Boolean(this.settings.billingRefreshToken);
    // Free usage is account-scoped; discard any legacy local starter pool.
    this.settings.freeCharacters = 0;
    this.settings.purchasedCharacters = typeof this.settings.purchasedCharacters === "number" ? this.settings.purchasedCharacters : DEFAULT_SETTINGS.purchasedCharacters;


} catch (diagnosticError36) { diagnostics?.failure?.("main.loadSettings", diagnosticError36); throw diagnosticError36; } finally { diagnosticEnd36(); }
}

  async saveSettings(): Promise<void> {
const diagnosticEnd37 = diagnostics?.start?.("main.saveSettings") ?? (() => {});
try {

    await this.saveData(this.settings);

    if (this.logger) {
      this.logger.setEnabled(this.settings.enableLogging);
    }

} catch (diagnosticError37) { diagnostics?.failure?.("main.saveSettings", diagnosticError37); throw diagnosticError37; } finally { diagnosticEnd37(); }
}

}
