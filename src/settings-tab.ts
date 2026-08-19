import { PluginSettingTab, Setting } from "obsidian";
import { transformations } from "./transformations";
import type TorbertTextAiPlugin from "./main";
import { openCheckout, syncPurchasedCharactersFromConstance } from "./billing";

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

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Text Format Helper Settings" });

    new Setting(containerEl).setName("Billing").setHeading();
    containerEl.createEl("p", {
      text: "Each AI call costs 1 credit per 1,000 characters. New installs start with 2,000 free characters; buy one-time character packs below when you run out.",
    });
    this.creditsSummaryEl = containerEl.createEl("p", { cls: "torbert-credits-summary" });
    this.renderCreditsSummary();

    new Setting(containerEl)
      .setName("Billing email")
      .setDesc("Used only for the TutivSoft checkout receipt.")
      .addText((text) => text
        .setPlaceholder("you@example.com")
        .setValue(this.plugin.settings.billingEmail)
        .onChange(async (value) => {
          this.plugin.settings.billingEmail = value.trim();
          await this.plugin.saveSettings();
        }));
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

    new Setting(containerEl).setName("UI Settings").setHeading();

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

    new Setting(containerEl).setName("Privacy").setHeading();

    new Setting(containerEl)
      .setName("Enable debug logging")
      .setDesc('Writes detailed plugin operation information to a "plugin.log" file in the plugin directory. This is useful for troubleshooting.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enableLogging)
        .onChange(async (value) => {
          this.plugin.settings.enableLogging = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName("AI").setHeading();

    new Setting(containerEl).setName("OpenRouter").setHeading();

    new Setting(containerEl)
      .setName("OpenRouter API key")
      .setDesc("Stored in this vault's local plugin data and sent only to OpenRouter.")
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
      .setName("Enabled Transformations")
      .setDesc('Choose which text transformations to show in the "Torbert Text AI" context submenu.')
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
