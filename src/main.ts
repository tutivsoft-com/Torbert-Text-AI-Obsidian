import { Modal, Notice, Plugin, TFile, TFolder, type App, type Editor, type Menu, type MenuItem } from "obsidian";
import { classifyFolderFromContent, collectAiUsageDuring, generateFileNameFromContent, parseOpenAiApiKey, rewriteWithOpenAi, sanitizeFolderName, type AiUsageSummary } from "./ai";
import { isWeakTitle, noteSimilarity, parseFolderList, suggestTitleFromContent } from "./feature-utils";
import { FileLogger } from "./logger";
import { generateEventId, retryPendingSpendEvents, spendConstanceCredits, syncPurchasedCharactersFromConstance } from "./billing";
import { claimAccountFreeUsage } from "./constance-account";
import { DEFAULT_SETTINGS } from "./settings";
import { TorbertTextAiSettingTab } from "./settings-tab";
import { transformations } from "./transformations";
import type { CustomPromptPreset, OperationHistoryEntry, OperationHistorySnapshot, PluginSettings, TransformationId } from "./types";
import { PluginSupport } from "./plugin-support";

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

/** Shows a bounded before/after preview so batch edits are never implicit. */
class BatchPreviewModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly items: PreviewItem[],
    private readonly onApply: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    contentEl.createEl("p", { text: `${this.items.length} item(s) will change. Nothing is written until you choose Apply.` });
    const preview = contentEl.createEl("pre");
    const previewLines = this.items.flatMap((item) => [item.label, ...(item.detail ? item.detail.split("\n") : [])]);
    preview.setText(previewLines.slice(0, 240).join("\n") || "No changes.");
    preview.style.maxHeight = "420px";
    preview.style.overflow = "auto";
    const buttonRow = contentEl.createDiv();
    buttonRow.style.display = "flex";
    buttonRow.style.gap = "8px";
    buttonRow.style.justifyContent = "flex-end";
    const cancelButton = buttonRow.createEl("button", { text: "Cancel" });
    cancelButton.onclick = () => this.close();
    const applyButton = buttonRow.createEl("button", { text: "Apply" });
    applyButton.addClass("mod-cta");
    applyButton.onclick = () => {
      this.close();
      this.onApply();
    };
  }
}

export default class TorbertTextAiPlugin extends Plugin {
  support!: PluginSupport;
  settings!: PluginSettings;
  private logger!: FileLogger;

  async onload(): Promise<void> {
    this.support = new PluginSupport(this, { name: "Torbert Text AI", summary: "Transform, summarize, organize, and clean Markdown text.", quickStart: ["Sign in to billing in Settings.", "Select text or open a note.", "Choose a Torbert transformation and review the result."], commands: ["Open transformations", "Undo last operation", "Copy debug log"], troubleshooting: ["Use Copy debug log before reporting a problem.", "Confirm the current note is Markdown and editable."] });
    this.support.start();
    try {
      const logFilePath = `${this.manifest.dir || "."}/plugin.log`;

      this.logger = new FileLogger(this.app.vault.adapter, logFilePath);
      await this.loadSettings();
      if (!this.settings.constanceDeviceId) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        this.settings.constanceDeviceId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        await this.saveSettings();
      }
      this.settings.pendingSpendEvents = Array.isArray(this.settings.pendingSpendEvents) ? this.settings.pendingSpendEvents.filter((item) => item && typeof item.eventId === "string" && Number.isInteger(item.amount) && item.amount > 0) : [];
      await this.saveSettings();
      this.logger.setEnabled(this.settings.enableLogging);
      this.logger.info("Plugin.onload", "Plugin is loading.");

      // Background balance sync; never blocks load, fails silently offline.
      void syncPurchasedCharactersFromConstance(this).then(() => retryPendingSpendEvents(this));

      if (this.settings.showRibbonIcon) {
        this.addRibbonIcon("wand", "Replace bold with highlight", () => this.applyTransformationToEditor(null, "boldToHighlight"));
      }

      this.addCommand({
        id: "replace-bold-with-highlight",
        name: "Torbert Text AI: Text Cleanup / Bold to Highlight",
        editorCallback: (editor) => this.applyTransformationToEditor(editor, "boldToHighlight"),
      });
      this.addCommand({
        id: "restore-last-torbert-change",
        name: "Restore last Torbert Text AI change",
        callback: () => {
          void this.restoreLastOperation();
        },
      });
      this.registerTransformationCommands();

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
                if (target instanceof TFolder) {
                  void this.applyTransformationToFolder(target, "boldToHighlight");
                } else if (target instanceof TFile) {
                  void this.applyTransformationToFile(target, "boldToHighlight");
                } else {
                  void this.applyTransformationToEditor(target, "boldToHighlight");
                }
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
                          .setTitle("AI Rename from Content")
                          .onClick(() => {
                            if (target instanceof TFolder) {
                              void this.renameFilesInFolderFromContents(target);
                            } else {
                              void this.renameFileFromContents(target);
                            }
                          });
                      });
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle("AI Classify Folder")
                          .onClick(() => {
                            if (target instanceof TFolder) {
                              void this.classifyFilesInFolder(target);
                            } else {
                              void this.classifyFile(target);
                            }
                          });
                      });
                    }

                    transformationsForCategory.forEach(([transformationId, transformation]) => {
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle(this.getTransformationMenuTitle(transformation))
                          .onClick(() => {
                            if (target instanceof TFolder) {
                              void this.applyTransformationToFolder(target, transformationId);
                            } else if (target instanceof TFile) {
                              void this.applyTransformationToFile(target, transformationId);
                            } else {
                              void this.applyTransformationToEditor(target, transformationId);
                            }
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
                                  if (target instanceof TFolder) {
                                    void this.applyCustomPromptToFolder(target, preset);
                                  } else {
                                    void this.applyCustomPromptToFile(target, preset);
                                  }
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
                            void this.createWeakTitlesReport(target);
                          });
                      });
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle("Find Duplicate Notes")
                          .onClick(() => {
                            void this.createDuplicateNotesReport(target);
                          });
                      });
                    }

                    if (category === "Markdown Notes") {
                      categoryMenu.addItem((submenuItem) => {
                        submenuItem
                          .setTitle("Restore Last Change")
                          .onClick(() => {
                            void this.restoreLastOperation();
                          });
                      });
                    }
                  });
                });
            });
          }
        }
      };

      this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => addTransformationMenuItems(menu, editor)));
      this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          addTransformationMenuItems(menu, file);
        } else if (file instanceof TFolder) {
          addTransformationMenuItems(menu, file);
        }
      }));

      this.addSettingTab(new TorbertTextAiSettingTab(this.app, this));
      this.logger.info("Plugin.onload", "Plugin has loaded successfully.");
    } catch (error) {
      console.error("Fatal error loading Text Format Helper plugin:", error);
      new Notice("Error: Text Format Helper plugin failed to load. Check developer console.");
    }
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
        name: `Torbert Text AI: ${category} / ${transformation.name}`,
        editorCallback: (editor) => {
          void this.applyTransformationToEditor(editor, transformationId);
        },
      });
    });

    this.addCommand({
      id: "ai-rename-current-note-from-content",
      name: "Torbert Text AI: AI / Rename current note from content",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== "md") {
          return false;
        }
        if (!checking) {
          void this.renameFileFromContents(file);
        }
        return true;
      },
    });

    this.addCommand({
      id: "ai-classify-current-note",
      name: "Torbert Text AI: AI / Classify current note folder",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== "md") {
          return false;
        }
        if (!checking) {
          void this.classifyFile(file);
        }
        return true;
      },
    });

    this.addCommand({
      id: "report-weak-titles-current-folder",
      name: "Torbert Text AI: Markdown Notes / Find weak titles in current folder",
      checkCallback: (checking) => {
        const folder = this.app.workspace.getActiveFile()?.parent;
        if (!(folder instanceof TFolder)) {
          return false;
        }
        if (!checking) {
          void this.createWeakTitlesReport(folder);
        }
        return true;
      },
    });

    this.addCommand({
      id: "report-duplicate-notes-current-folder",
      name: "Torbert Text AI: Markdown Notes / Find duplicate notes in current folder",
      checkCallback: (checking) => {
        const folder = this.app.workspace.getActiveFile()?.parent;
        if (!(folder instanceof TFolder)) {
          return false;
        }
        if (!checking) {
          void this.createDuplicateNotesReport(folder);
        }
        return true;
      },
    });
  }

  onunload(): void {
    this.logger.info("Plugin.onunload", "Plugin is unloading.");
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
    cancelButton.onclick = () => {
      cancelled = true;
      abortController.abort();
      message.textContent = `${label} cancelled.`;
    };
    fragment.append(message, cancelButton);
    const notice = new Notice(fragment, 0);
    const update = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      message.textContent = `${label}... ${elapsedSeconds} second(s) elapsed.`;
    };
    update();
    const intervalId = window.setInterval(update, 1000);

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

  private getTransformationMenuTitle(transformation: { name: string; usesFullText?: boolean }): string {
    return `${transformation.name}${transformation.usesFullText ? " (Full Text)" : ""}`;
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
    return `Tokens: ${tokenText} (${requestText}, ${this.formatCompactNumber(usage.inputChars)} chars in, ${this.formatCompactNumber(usage.outputChars)} chars out)`;
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
   * Charges the character credits for a single AI call (App_Credit_Unit_Name
   * is "characters" -- ceil(chars/1000) credits per call). Spends the local
   * free pool first, then the Constance-backed purchased pool. Returns false
   * (and shows a Notice) when authentication, balance, or spend verification
   * is unavailable. AI work never proceeds without an authoritative charge.
   */
  async chargeCharacters(charCount: number): Promise<boolean> {
    const cost = Math.max(1, Math.ceil(charCount));
    if (!this.settings.billingAccessToken || !this.settings.billingAccountLinked) {
      new Notice("Torbert: sign in or create a billing account in plugin settings before running AI.");
      return false;
    }
    const free = await claimAccountFreeUsage(this.settings, "torbert-text-ai-obsidian", this.settings.constanceDeviceId, `free_${generateEventId()}`, cost);
    if (free.kind === "ok") {
      this.settings.freeCharacters = free.remaining;
      await this.saveSettings();
      return true;
    }
    if (free.kind === "auth-required") { this.settings.billingAccessToken = ""; this.settings.billingAccountLinked = false; await this.saveSettings(); new Notice("Torbert: your billing session expired. Sign in again."); return false; }
    if (free.kind === "error") { new Notice("Torbert: the account allowance could not be verified. No AI request was sent."); return false; }

    await retryPendingSpendEvents(this);
    if (this.settings.pendingSpendEvents.length > 0) {
      new Notice("Torbert: a previous credit spend is still being reconciled. Please retry when the connection is restored.");
      return false;
    }
    const stableEventId = generateEventId();
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
      this.settings.purchasedCharacters = 0;
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      await this.saveSettings();
      new Notice("Torbert: out of characters. Buy more in plugin settings (Buy $1 / $5 / $15 packs).");
      return false;
    }

    this.logger.warn("chargeCharacters", "Credit spend status is unknown; blocking the AI call until the stable event is reconciled.");
    new Notice("Torbert: billing could not be verified. Retry after the connection is restored.");
    return false;
  }

  pollAfterCheckout(): void {
    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      void syncPurchasedCharactersFromConstance(this);
      if (attempts >= 6) {
        window.clearInterval(intervalId);
      }
    }, 15000);
  }

  /** Preview and apply a transformation to the active editor or current selection. */
  async applyTransformationToEditor(editor: Editor | null, transformationId: TransformationId): Promise<void> {
    let processingNotice: ProcessingNotice | null = null;
    try {
      const targetEditor = editor || this.app.workspace.activeEditor?.editor;

      if (!targetEditor) {
        new Notice("No active editor found.");
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
      processingNotice = this.startProcessingNotice(`Processing ${transformation.name}`);
      const abortSignal = processingNotice.abortSignal;
      const { result: transformationResult, usage } = await collectAiUsageDuring(() => Promise.resolve(transformation.transform(textToTransform, { settings: this.settings, abortSignal })));
      const { newText, noticeText } = transformationResult;

      if (newText !== textToTransform) {
        new BatchPreviewModal(
          this.app,
          `Review ${transformation.name}`,
          [{
            label: selection ? "Current selection" : "Current note",
            detail: summarizeTextChange(textToTransform, newText),
          }],
          () => {
            void (async () => {
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
                this.logger.error("applyTransformationToEditor", `Failed to apply '${transformationId}' after preview`, error);
                new Notice("Error applying the reviewed change. The original text was kept.");
              }
            })();
          },
        ).open();
        return;
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
      this.logger.error("applyTransformationToEditor", `Failed to apply '${transformationId}'`, error);
      new Notice(processingNotice?.wasCancelled() ? "Operation cancelled." : "Error applying transformation. Check developer console.");
    } finally {
      processingNotice?.close();
    }
  }

  /** Preview and apply one transformation to a single Markdown file. */
  async applyTransformationToFile(file: TFile, transformationId: TransformationId): Promise<void> {
    let processingNotice: ProcessingNotice | null = null;
    try {
      const transformation = transformations[transformationId];
      if (!transformation) {
        return;
      }

      const fileContents = await this.app.vault.read(file);
      processingNotice = this.startProcessingNotice(`Processing ${file.name}`);
      const abortSignal = processingNotice.abortSignal;
      const { result: transformationResult, usage } = await collectAiUsageDuring(() => Promise.resolve(transformation.transform(fileContents, { settings: this.settings, abortSignal })));
      const { newText, noticeText } = transformationResult;

      if (newText !== fileContents) {
        new BatchPreviewModal(
          this.app,
          `Review ${transformation.name}`,
          [{ label: file.path, detail: summarizeTextChange(fileContents, newText) }],
          () => {
            void (async () => {
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
                this.logger.error("applyTransformationToFile", `Failed to apply '${transformationId}' after preview`, error);
                new Notice(`Error applying the reviewed change to ${file.name}. The original text was kept.`);
              }
            })();
          },
        ).open();
        return;
      }

      if (!processingNotice.wasCancelled()) {
        new Notice(`${noticeText} in ${file.name}`);
        this.showAiUsage(`${transformation.name} on ${file.name}`, usage);
      }
      this.logger.info("applyTransformationToFile", `Applied '${transformationId}' to ${file.path}.`);

    } catch (error) {
      this.logger.error("applyTransformationToFile", `Failed to apply '${transformationId}' to file ${file.path}`, error);
      new Notice(processingNotice?.wasCancelled() ? "Operation cancelled." : `Error processing file ${file.name}. Check developer console.`);
    } finally {
      processingNotice?.close();
    }
  }

  /** Preview a folder batch, then process files with cancellation and progress. */
  async applyTransformationToFolder(folder: TFolder, transformationId: TransformationId): Promise<void> {
    let processingNotice: ProcessingNotice | null = null;
    try {
      const files = this.getMarkdownFilesInFolder(folder);

      if (files.length === 0) {
        new Notice(`No Markdown files found in ${folder.name}.`);
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
          failedCount++;
          this.logger.error("applyTransformationToFolder", `Failed '${transformationId}' on ${file.path}`, error);
        }
      }

      if (pendingWrites.length > 0) {
        const previewItems = pendingWrites.map((item) => ({
          label: item.file.path,
          detail: summarizeTextChange(item.oldText, item.newText),
        }));
        new BatchPreviewModal(this.app, `Review ${transformations[transformationId]?.name || transformationId}`, previewItems, () => {
          void this.applyPendingFolderWrites(folder, transformationId, pendingWrites, snapshots, processedCount, failedCount);
        }).open();
        return;
      }

      const failureText = failedCount > 0 ? ` ${failedCount} file(s) failed.` : "";
      new Notice(`Applied to ${processedCount} Markdown file(s) in ${folder.name}.${failureText}`);
      this.logger.info("applyTransformationToFolder", `Applied '${transformationId}' to ${processedCount} file(s) in ${folder.path}. Failed: ${failedCount}.`);

    } catch (error) {
      this.logger.error("applyTransformationToFolder", `Failed to apply '${transformationId}' to folder ${folder.path}`, error);
      new Notice(processingNotice?.wasCancelled() ? "Operation cancelled." : `Error processing folder ${folder.name}. Check developer console.`);
    } finally {
      processingNotice?.close();
    }
  }

  private async applyPendingFolderWrites(
    folder: TFolder,
    transformationId: TransformationId,
    pendingWrites: Array<{ file: TFile; oldText: string; newText: string }>,
    snapshots: OperationHistorySnapshot[],
    processedCount: number,
    failedCount: number,
  ): Promise<void> {
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
          failedCount++;
          reportItems.push({ path: pendingWrite.file.path, status: "failed", message: String(error) });
          this.logger.error("applyPendingFolderWrites", `Failed '${transformationId}' on ${pendingWrite.file.path}`, error);
        }
      }

      await this.createBatchReport(`Folder ${transformations[transformationId]?.name || transformationId}`, folder.path, reportItems);
      const failureText = failedCount > 0 ? ` ${failedCount} file(s) failed.` : "";
      new Notice(`Applied to ${processedCount} Markdown file(s) in ${folder.name}.${failureText}`);

    } catch (error) {
      this.logger.error("applyPendingFolderWrites", `Cancelled or failed applying '${transformationId}' in ${folder.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying changes in ${folder.name}.`);
    } finally {
      processingNotice.close();
    }
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

  async renameFileFromContents(file: TFile): Promise<void> {
    const processingNotice = this.startProcessingNotice(`Processing AI rename for ${file.name}`);
    try {
      const fileContents = await this.app.vault.read(file);
      if (!(await this.chargeCharacters(fileContents.length))) {
        return;
      }
      const { result: newBaseName, usage } = await collectAiUsageDuring(() => generateFileNameFromContent(this.settings, file.basename, fileContents, processingNotice.abortSignal));
      this.showAiUsage(`AI Rename from Content on ${file.name}`, usage);
      const newPath = await this.getAvailableSiblingPath(file, `${newBaseName}.md`);

      if (newPath === file.path) {
        new Notice(`${file.name} already has the suggested name.`);
        return;
      }

      await this.recordOperation("AI Rename File from Contents", [{
        path: file.path,
        currentPath: newPath,
        content: fileContents,
      }]);
      await this.app.vault.rename(file, newPath);
      if (!processingNotice.wasCancelled()) {
        new Notice(`Renamed to ${newPath.split("/").pop() || newPath}.`);
      }
      this.logger.info("renameFileFromContents", `Renamed ${file.path} to ${newPath}.`);
    } catch (error) {
      this.logger.error("renameFileFromContents", `Failed to rename ${file.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error renaming ${file.name}. Check developer console.`);
    } finally {
      processingNotice.close();
    }
  }

  async renameFilesInFolderFromContents(folder: TFolder): Promise<void> {
    const files = this.getMarkdownFilesInFolder(folder);

    if (files.length === 0) {
      new Notice(`No Markdown files found in ${folder.name}.`);
      return;
    }

    const processingNotice = this.startProcessingNotice(`Processing AI rename for ${files.length} file(s)`);

    const snapshots: OperationHistorySnapshot[] = [];
    const renamePlan: Array<{ file: TFile; newPath: string }> = [];
    const reservedPaths = new Set<string>();
    let renamedCount = 0;
    let failedCount = 0;

    try {
      for (const file of files) {
        try {
          processingNotice.throwIfCancelled();
          const fileContents = await this.app.vault.read(file);
          if (!(await this.chargeCharacters(fileContents.length))) {
            this.logger.info("renameFilesInFolderFromContents", "Out of characters; stopped the batch.");
            break;
          }
          const { result: newBaseName, usage } = await collectAiUsageDuring(() => generateFileNameFromContent(this.settings, file.basename, fileContents, processingNotice.abortSignal));
          this.showAiUsage(`AI Rename from Content on ${file.name}`, usage);
          const newPath = await this.getAvailableSiblingPath(file, `${newBaseName}.md`, reservedPaths);

          if (newPath === file.path) {
            continue;
          }

          reservedPaths.add(newPath);
          snapshots.push({
            path: file.path,
            currentPath: newPath,
            content: fileContents,
          });
          renamePlan.push({ file, newPath });
        } catch (error) {
          failedCount++;
          this.logger.error("renameFilesInFolderFromContents", `Failed to rename ${file.path}`, error);
        }
      }
    } catch (error) {
      this.logger.error("renameFilesInFolderFromContents", `Cancelled or failed rename planning in ${folder.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error planning renames in ${folder.name}.`);
      return;
    } finally {
      processingNotice.close();
    }

    const applyRenames = async () => {
      const applyNotice = this.startProcessingNotice(`Applying ${renamePlan.length} rename(s)`);
      try {
      applyNotice.throwIfCancelled();
      if (snapshots.length > 0) {
        await this.recordOperation("AI Rename Folder Files from Contents", snapshots);
      }

      const reportItems: BatchReportItem[] = [];
      for (const item of renamePlan) {
        try {
          applyNotice.throwIfCancelled();
          const oldPath = item.file.path;
          await this.app.vault.rename(item.file, item.newPath);
          renamedCount++;
          reportItems.push({ path: oldPath, newPath: item.newPath, status: "renamed" });
        } catch (error) {
          failedCount++;
          reportItems.push({ path: item.file.path, newPath: item.newPath, status: "failed", message: String(error) });
          this.logger.error("renameFilesInFolderFromContents", `Failed to rename ${item.file.path} to ${item.newPath}`, error);
        }
      }

      await this.createBatchReport("AI Rename Folder Files from Contents", folder.path, reportItems);
      const failureText = failedCount > 0 ? ` ${failedCount} file(s) failed.` : "";
      new Notice(`Renamed ${renamedCount} file(s) in ${folder.name}.${failureText}`);
      } catch (error) {
        this.logger.error("renameFilesInFolderFromContents", `Cancelled or failed applying renames in ${folder.path}`, error);
        new Notice(applyNotice.wasCancelled() ? "Operation cancelled." : `Error applying renames in ${folder.name}.`);
      } finally {
        applyNotice.close();
      }
    };

    if (renamePlan.length === 0) {
      new Notice(`No file renames suggested in ${folder.name}.`);
      return;
    }

    new BatchPreviewModal(this.app, "AI Rename from Content", renamePlan.map((item) => ({
      label: item.file.path,
      detail: `Proposed path: ${item.newPath}`,
    })), () => {
      void applyRenames();
    }).open();
  }

  async classifyFile(file: TFile): Promise<void> {
    await this.classifyFiles([file], file.parent?.path || "");
  }

  async classifyFilesInFolder(folder: TFolder): Promise<void> {
    const files = this.getMarkdownFilesInFolder(folder);
    if (files.length === 0) {
      new Notice(`No Markdown files found in ${folder.name}.`);
      return;
    }

    await this.classifyFiles(files, folder.path);
  }

  private async classifyFiles(files: TFile[], sourcePath: string): Promise<void> {
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
          failedCount++;
          this.logger.error("classifyFiles", `Failed to classify ${file.path}`, error);
        }
      }
    } catch (error) {
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

    new BatchPreviewModal(this.app, "AI Classify Folder", movePlan.map((item) => ({
      label: item.file.path,
      detail: `Proposed path: ${item.newPath}`,
    })), () => {
      void this.applyMovePlan("AI Folder Classification", sourcePath, movePlan, snapshots, failedCount);
    }).open();
  }

  private async applyMovePlan(
    label: string,
    sourcePath: string,
    movePlan: Array<{ file: TFile; newPath: string }>,
    snapshots: OperationHistorySnapshot[],
    failedCount: number,
  ): Promise<void> {
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
          failedCount++;
          reportItems.push({ path: item.file.path, newPath: item.newPath, status: "failed", message: String(error) });
          this.logger.error("applyMovePlan", `Failed to move ${item.file.path} to ${item.newPath}`, error);
        }
      }

      await this.createBatchReport(label, sourcePath, reportItems);
      new Notice(`Moved ${movedCount} file(s).${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
    } catch (error) {
      this.logger.error("applyMovePlan", `Cancelled or failed move plan for ${sourcePath}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : "Error applying move plan.");
    } finally {
      processingNotice.close();
    }
  }

  async createWeakTitlesReport(folder: TFolder): Promise<void> {
    const processingNotice = this.startProcessingNotice(`Creating weak title report for ${folder.name}`);
    try {
      const items: string[] = [];
      let failedCount = 0;

      for (const file of this.getMarkdownFilesInFolder(folder)) {
        processingNotice.throwIfCancelled();
        if (!isWeakTitle(file.basename)) {
          continue;
        }

        try {
          const content = await this.app.vault.read(file);
          items.push(`- ${file.path} -> ${suggestTitleFromContent(content, file.basename)}.md`);
        } catch (error) {
          failedCount++;
          this.logger.error("createWeakTitlesReport", `Failed to inspect ${file.path}`, error);
        }
      }

      const body = [
        "# Weak Title Suggestions",
        "",
        `Source folder: ${folder.path}`,
        `Created: ${new Date().toISOString()}`,
        "",
        items.length > 0 ? items.join("\n") : "No weak titles found.",
        failedCount > 0 ? `\nFailed files: ${failedCount}` : "",
      ].filter(Boolean).join("\n");
      const reportPath = await this.createReportNote(folder.path, "weak-title-suggestions", body);
      new Notice(`Weak title report created: ${reportPath}`);
    } catch (error) {
      this.logger.error("createWeakTitlesReport", `Failed to create report for ${folder.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error creating weak title report for ${folder.name}.`);
    } finally {
      processingNotice.close();
    }
  }

  async createDuplicateNotesReport(folder: TFolder): Promise<void> {
    const processingNotice = this.startProcessingNotice(`Creating duplicate note report for ${folder.name}`);
    try {
      const files = this.getMarkdownFilesInFolder(folder);
      const readResults = await Promise.allSettled(files.map(async (file) => ({ file, content: await this.app.vault.read(file) })));
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
      this.logger.error("createDuplicateNotesReport", `Failed to create report for ${folder.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error creating duplicate note report for ${folder.name}.`);
    } finally {
      processingNotice.close();
    }
  }

  async applyCustomPromptToFile(file: TFile, preset: CustomPromptPreset): Promise<void> {
    const processingNotice = this.startProcessingNotice(`Processing prompt for ${file.name}`);
    try {
      const fileContents = await this.app.vault.read(file);
      if (!(await this.chargeCharacters(fileContents.length))) {
        return;
      }
      const { result: newText, usage } = await collectAiUsageDuring(() => rewriteWithOpenAi(this.settings, preset.prompt, fileContents, processingNotice.abortSignal));

      if (newText !== fileContents) {
        new BatchPreviewModal(
          this.app,
          `Review prompt: ${preset.name}`,
          [{ label: file.path, detail: summarizeTextChange(fileContents, newText) }],
          () => {
            void (async () => {
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
                this.logger.error("applyCustomPromptToFile", `Failed prompt '${preset.name}' after preview`, error);
                new Notice(`Error applying the reviewed change to ${file.name}. The original text was kept.`);
              }
            })();
          },
        ).open();
        return;
      }

      if (!processingNotice.wasCancelled()) {
        new Notice(`Applied prompt preset to ${file.name}.`);
        this.showAiUsage(`Prompt ${preset.name} on ${file.name}`, usage);
      }
    } catch (error) {
      this.logger.error("applyCustomPromptToFile", `Failed prompt '${preset.name}' on ${file.path}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying prompt preset to ${file.name}.`);
    } finally {
      processingNotice.close();
    }
  }

  async applyCustomPromptToFolder(folder: TFolder, preset: CustomPromptPreset): Promise<void> {
    let processingNotice: ProcessingNotice | null = null;
    const files = this.getMarkdownFilesInFolder(folder);
    const pendingWrites: Array<{ file: TFile; oldText: string; newText: string }> = [];
    const snapshots: OperationHistorySnapshot[] = [];
    let failedCount = 0;

    try {
      processingNotice = this.startProcessingNotice(`Processing prompt for ${files.length} file(s)`);
      for (const file of files) {
        try {
          processingNotice.throwIfCancelled();
          const fileContents = await this.app.vault.read(file);
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
          failedCount++;
          this.logger.error("applyCustomPromptToFolder", `Failed prompt '${preset.name}' on ${file.path}`, error);
        }
      }
    } catch (error) {
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

    new BatchPreviewModal(this.app, `Review prompt: ${preset.name}`, pendingWrites.map((item) => ({
      label: item.file.path,
      detail: summarizeTextChange(item.oldText, item.newText),
    })), () => {
      void this.applyCustomPromptFolderWrites(folder.path, preset, pendingWrites, snapshots, failedCount);
    }).open();
  }

  private async applyCustomPromptFolderWrites(
    sourcePath: string,
    preset: CustomPromptPreset,
    pendingWrites: Array<{ file: TFile; oldText: string; newText: string }>,
    snapshots: OperationHistorySnapshot[],
    failedCount: number,
  ): Promise<void> {
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
          failedCount++;
          reportItems.push({ path: pendingWrite.file.path, status: "failed", message: String(error) });
        }
      }

      await this.createBatchReport(`Prompt ${preset.name}`, sourcePath, reportItems);
      new Notice(`Applied prompt preset to ${pendingWrites.length} file(s).${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
    } catch (error) {
      this.logger.error("applyCustomPromptFolderWrites", `Cancelled or failed applying prompt '${preset.name}' in ${sourcePath}`, error);
      new Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying prompt changes.`);
    } finally {
      processingNotice.close();
    }
  }

  /** Restore the most recent saved operation snapshot after explicit confirmation. */
  async restoreLastOperation(): Promise<void> {
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
              throw new Error("No active editor found for editor-only restore.");
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
  }

  private async recordEditorSnapshot(label: string, editor: Editor): Promise<void> {
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
  }

  private async recordOperation(label: string, snapshots: OperationHistorySnapshot[]): Promise<void> {
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
  }

  private async getAvailableSiblingPath(file: TFile, fileName: string, reservedPaths = new Set<string>()): Promise<string> {
    const folderPath = file.parent?.path && file.parent.path !== "/" ? `${file.parent.path}/` : "";
    const extension = ".md";
    const baseName = fileName.replace(/\.md$/i, "");
    let candidatePath = `${folderPath}${baseName}${extension}`;
    let suffix = 2;

    while (candidatePath !== file.path && (reservedPaths.has(candidatePath) || await this.app.vault.adapter.exists(candidatePath))) {
      candidatePath = `${folderPath}${baseName}-${suffix}${extension}`;
      suffix++;
    }

    return candidatePath;
  }

  private async getAvailablePathInFolder(folderPath: string, fileName: string, reservedPaths = new Set<string>()): Promise<string> {
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

    return candidatePath;
  }

  private async ensureFolderPath(folderPath: string): Promise<void> {
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

    return this.createReportNote(sourcePath, "torbert-batch-report", lines.join("\n"));
  }

  private async createReportNote(sourcePath: string, slug: string, content: string): Promise<string> {
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
    return path;
  }

  async loadSettings(): Promise<void> {
    const loadedSettings = await this.loadData();

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
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
    this.settings.billingAccountLinked = this.settings.billingAccountLinked === true && Boolean(this.settings.billingAccessToken);
    // Free usage is account-scoped; discard any legacy local starter pool.
    this.settings.freeCharacters = 0;
    this.settings.purchasedCharacters = typeof this.settings.purchasedCharacters === "number" ? this.settings.purchasedCharacters : DEFAULT_SETTINGS.purchasedCharacters;

  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);

    if (this.logger) {
      this.logger.setEnabled(this.settings.enableLogging);
    }
  }

}
