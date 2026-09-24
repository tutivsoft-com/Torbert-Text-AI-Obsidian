import { PluginSettingTab, Setting } from "obsidian";
import { transformations } from "./transformations";
import type TorbertTextAiPlugin from "./main";
import { openCheckout, syncPurchasedCharactersFromConstance } from "./billing";
import { addBillingAccountSettings } from "./constance-account";

const TRANSFORMATION_CATEGORY_ORDER = [
  "AI",
  "Text Cleanup",
  "Markdown Notes",
];

export class TorbertTextAiSettingTab extends PluginSettingTab {
  private creditsSummaryEl: HTMLElement | null = null;

  constructor(
    app: ConstructorParameters<typeof PluginSettingTab>[0],
    private readonly plugin: TorbertTextAiPlugin,
  ) {
    super(app, plugin);
  }

  private renderCreditsSummary(): void {
    if (!this.creditsSummaryEl) {
      return;
    }
    const { freeCharacters, purchasedCharacters } = this.plugin.settings;
    const totalChars = freeCharacters + purchasedCharacters;
    this.creditsSummaryEl.setText(
      `Characters remaining: ${totalChars.toLocaleString()} (${freeCharacters.toLocaleString()} free + ${purchasedCharacters.toLocaleString()} purchased)`,
    );
  }

  /** Render the quick-start settings first and keep advanced controls grouped below. */
  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Torbert Text AI Settings" });

    new Setting(containerEl).setName("Getting started").setHeading();
    containerEl.createEl("p", {
      text: "Non-AI transformations stay inside this vault. AI transformations are optional and send the selected text or note content to OpenRouter when you run them. An API key is optional when Torbert's built-in service is available. Note and folder edits apply when launched; the latest applied change can be restored from the command palette. Every transformation is also searchable in the command palette under Torbert Text AI.",
    });
    new Setting(containerEl).setName("Review before applying").setDesc("Off by default for one-click edits. Turn on to review before/after changes for notes, folders, and AI moves.").addToggle((toggle) => toggle.setValue(this.plugin.settings.reviewBeforeApply).onChange(async (value) => { this.plugin.settings.reviewBeforeApply = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName("Billing").setHeading();
    containerEl.createEl("p", {
      text: "AI usage is metered by input characters. Each billing account gets a one-time 2,000-character starter allowance across linked installations; buy one-time character packs below when you run out.",
    });
    this.creditsSummaryEl = containerEl.createEl("p", { cls: "torbert-credits-summary" });
    this.renderCreditsSummary();

    addBillingAccountSettings(containerEl, { state: this.plugin.settings, appId: "torbert-text-ai-obsidian", installationId: this.plugin.settings.constanceDeviceId, appVersion: this.plugin.manifest.version, persist: () => this.plugin.saveSettings(), syncBalance: () => syncPurchasedCharactersFromConstance(this.plugin), refresh: () => this.display() });
    const buySetting = new Setting(containerEl)
      .setName("Buy characters")
      .setDesc("Opens secure checkout on app.tutivsoft.com for a one-time character pack. Credits apply to this device's balance after payment.");
    buySetting.addButton((button) => button.setButtonText("Buy $1 (20,000 characters)").onClick(() => openCheckout(this.plugin, "usd_001")));
    buySetting.addButton((button) => button.setButtonText("Buy $5 (160,000 characters)").setCta().onClick(() => openCheckout(this.plugin, "usd_005")));
    buySetting.addButton((button) => button.setButtonText("Buy $15 (640,000 characters)").onClick(() => openCheckout(this.plugin, "usd_015")));

    new Setting(containerEl)
      .setName("Refresh balance")
      .setDesc("Pull the latest purchased-character balance from Constance.")
      .addButton((button) =>
        button.setButtonText("Refresh balance").onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("Refreshing...");
          await syncPurchasedCharactersFromConstance(this.plugin);
          this.renderCreditsSummary();
          button.setDisabled(false);
          button.setButtonText("Refresh balance");
        }),
      );

    // Sync on open so the summary reflects a purchase made since last time
    // Obsidian was open, without requiring a manual refresh click.
    void syncPurchasedCharactersFromConstance(this.plugin).then(() => this.renderCreditsSummary());

    new Setting(containerEl).setName("Menus and toolbar").setHeading();

    new Setting(containerEl)
      .setName("Show Ribbon Icon")
      .setDesc('Toggle the visibility of the "Bold to Highlight" icon in the left ribbon bar. You may need to reload Obsidian for this to take effect.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showRibbonIcon)
        .onChange(async (value) => {
          this.plugin.settings.showRibbonIcon = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Show "Bold to Highlight" in context menu')
      .setDesc('Show the primary "Torbert Bold to Highlight" command at the top level of the right-click context menu.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showContextMenuSingle)
        .onChange(async (value) => {
          this.plugin.settings.showContextMenuSingle = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Show "Torbert Text AI" submenu')
      .setDesc('Show the submenu containing all text transformations in the right-click context menu.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showContextMenuSubmenu)
        .onChange(async (value) => {
          this.plugin.settings.showContextMenuSubmenu = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName("Privacy & diagnostics").setHeading();
    containerEl.createEl("p", {
      text: "Torbert has no analytics or advertising. On startup it checks this install's purchased-character balance with TutivSoft. Debug logging is separate and off by default.",
    });

    new Setting(containerEl)
      .setName("Enable debug logging")
      .setDesc('Off by default. When enabled, writes operation details such as file paths and AI usage to "plugin.log" in the plugin directory for troubleshooting.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enableLogging)
        .onChange(async (value) => {
          this.plugin.settings.enableLogging = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName("AI features").setHeading();

    new Setting(containerEl).setName("Provider").setHeading();

    new Setting(containerEl)
      .setName("OpenRouter API key")
      .setDesc("Optional personal override. Torbert loads its own capped key automatically when this is blank; AI actions still send note text to OpenRouter.")
      .addText((text) => text
        .setPlaceholder("sk-...")
        .setValue(this.plugin.settings.openAiApiKey)
        .onChange(async (value) => {
          this.plugin.settings.openAiApiKey = value;
          await this.plugin.saveSettings();
        }))
      ;

    new Setting(containerEl)
      .setName("OpenRouter model")
      .setDesc("Model used by AI transformations.")
      .addText((text) => text
      .setPlaceholder("openai/gpt-5-mini")
        .setValue(this.plugin.settings.openAiModel)
        .onChange(async (value) => {
          this.plugin.settings.openAiModel = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Large-content OpenRouter model")
      .setDesc("Model used by AI transformations that need to inspect whole or larger note text.")
      .addText((text) => text
      .setPlaceholder("openai/gpt-5-mini")
        .setValue(this.plugin.settings.largeContentOpenAiModel)
        .onChange(async (value) => {
          this.plugin.settings.largeContentOpenAiModel = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName("Keyword Highlighting").setHeading();

    new Setting(containerEl)
      .setName("Keywords")
      .setDesc("Comma-separated or newline-separated keywords to wrap with Obsidian highlights.")
      .addTextArea((text) => text
        .setPlaceholder("important, urgent, follow up")
        .setValue(this.plugin.settings.highlightKeywords)
        .onChange(async (value) => {
          this.plugin.settings.highlightKeywords = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("AI classification folders")
      .setDesc("Newline- or comma-separated folder names for AI Folder Classification.")
      .addTextArea((text) => text
        .setPlaceholder("Jobs\nClients\nDevOps\nFinance")
        .setValue(this.plugin.settings.folderClassificationFolders)
        .onChange(async (value) => {
          this.plugin.settings.folderClassificationFolders = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Custom prompt presets")
      .setDesc('JSON array of named prompts. Example: [{"name":"Job Search cleanup","prompt":"Clean this note..."}]')
      .addTextArea((text) => text
        .setPlaceholder('[{"name":"Job Search cleanup","prompt":"Clean this note..."}]')
        .setValue(JSON.stringify(this.plugin.settings.customPromptPresets, null, 2))
        .onChange(async (value) => {
          try {
            const parsed = JSON.parse(value) as Array<{ name?: string; prompt?: string }>;
            this.plugin.settings.customPromptPresets = parsed
              .map((preset) => ({
                name: String(preset.name || "").trim(),
                prompt: String(preset.prompt || "").trim(),
              }))
              .filter((preset) => preset.name && preset.prompt);
            await this.plugin.saveSettings();
          } catch {
            // Keep the last valid presets while the user is editing JSON.
          }
        }));

    new Setting(containerEl)
      .setName("Transformation menu")
      .setDesc('Choose which transformations appear in the "Torbert Text AI" context submenu. Command-palette entries remain available.')
      .setHeading();

    TRANSFORMATION_CATEGORY_ORDER.forEach((category) => {
      const categoryTransformations = Object.entries(transformations)
        .filter(([, transformation]) => (transformation.category || "Text Cleanup") === category);

      if (categoryTransformations.length === 0) {
        return;
      }

      new Setting(containerEl).setName(category).setHeading();
      categoryTransformations.forEach(([transformationId, transformation]) => {
        new Setting(containerEl)
          .setName(transformation.name)
          .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.enabledTransformations[transformationId] ?? true)
            .onChange(async (value) => {
              this.plugin.settings.enabledTransformations[transformationId] = value;
              await this.plugin.saveSettings();
            }));
      });
    });
  }
}
