import { diagnostics } from "./diagnostics";
import { Notice, PluginSettingTab, Setting } from "obsidian";
import { transformations } from "./transformations";
import type TorbertTextAiPlugin from "./main";
import { addLivePacks, openCheckout, syncPurchasedCharactersFromConstance } from "./billing";
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
const diagnosticAction1 = () => {

    if (!this.creditsSummaryEl) {
      return;
    }
    const { freeCharacters, purchasedCharacters } = this.plugin.settings;
    const totalChars = freeCharacters + purchasedCharacters;
    this.creditsSummaryEl.setText(
      `Characters remaining: ${totalChars.toLocaleString()} (${freeCharacters.toLocaleString()} free + ${purchasedCharacters.toLocaleString()} purchased)`,
    );

}; return diagnostics?.run ? diagnostics.run("settings-tab.renderCreditsSummary", diagnosticAction1) : diagnosticAction1();
}

  /** Render the quick-start settings first and keep advanced controls grouped below. */
  display(): void {
return diagnostics.guard("settings-tab.display_1", () => {
const diagnosticAction2 = () => {

    const { containerEl } = this;

    const diagnosticStage3 = diagnostics?.start?.("settings.render.clear") ?? (() => {});
containerEl.empty();
diagnosticStage3();

    const diagnosticStage4 = diagnostics?.start?.("settings.render.help") ?? (() => {});
this.plugin.support.addHelpSetting(containerEl);
diagnosticStage4();

this.plugin.support.addDebugSetting?.(containerEl);


    const diagnosticStage5 = diagnostics?.start?.("settings.render.stage_1") ?? (() => {});
containerEl.createEl("h2", { text: "Torbert Text AI Settings" });
diagnosticStage5();


    const diagnosticStage6 = diagnostics?.start?.("settings.render.settings_mode") ?? (() => {});
new Setting(containerEl).setName("Settings mode").setDesc("Simple shows everyday controls. Advanced adds customization and troubleshooting.")
      .addDropdown(dropdown => dropdown.addOption("simple", "Simple").addOption("advanced", "Advanced — optional")
        .setValue(this.plugin.settings.settingsMode).onChange(async value => {
return diagnostics.guard("settings-tab.control_2", async () => {
const diagnosticEnd39 = diagnostics?.start?.("control.settings_mode.onChange") ?? (() => {});
try {

          this.plugin.settings.settingsMode = value === "advanced" ? "advanced" : "simple";
          await this.plugin.saveSettings(); this.display();

} catch (diagnosticError39) { diagnostics?.failure?.("control.settings_mode.onChange", diagnosticError39); throw diagnosticError39; } finally { diagnosticEnd39(); }

});
}));
diagnosticStage6();

    const diagnosticStage7 = diagnostics?.start?.("settings.render.getting_started") ?? (() => {});
new Setting(containerEl).setName("Getting started").setHeading();
diagnosticStage7();

    const diagnosticStage8 = diagnostics?.start?.("settings.render.stage_2") ?? (() => {});
containerEl.createEl("p", {
      text: "Local transformations stay in your vault. AI transformations send selected text or note content to OpenRouter when you run them. Use Restore last change to undo the latest operation.",
    });
diagnosticStage8();

    const diagnosticStage9 = diagnostics?.start?.("settings.render.ai_request_queue") ?? (() => {});
new Setting(containerEl)
      .setName("AI request queue")
      .setDesc("View the active AI action, text excerpt and elapsed time, or clear waiting actions.")
      .addButton((button) => button.setButtonText("Show queue").onClick(() => {
return diagnostics.guard("settings-tab.control_3", () => { const diagnosticAction40 = () => (this.plugin.aiQueue.open()); return diagnostics?.run ? diagnostics.run("control.ai_request_queue.onClick", diagnosticAction40) : diagnosticAction40();
});
}));
diagnosticStage9();

    const diagnosticStage10 = diagnostics?.start?.("settings.render.review_before_applying") ?? (() => {});
new Setting(containerEl).setName("Review before applying").setDesc("Review changes to notes and folders before applying them. Off by default.").addToggle((toggle) => toggle.setValue(this.plugin.settings.reviewBeforeApply).onChange(async (value) => {
return diagnostics.guard("settings-tab.control_4", async () => {
const diagnosticEnd41 = diagnostics?.start?.("control.review_before_applying.onChange") ?? (() => {});
try {
 this.plugin.settings.reviewBeforeApply = value; await this.plugin.saveSettings();
} catch (diagnosticError41) { diagnostics?.failure?.("control.review_before_applying.onChange", diagnosticError41); throw diagnosticError41; } finally { diagnosticEnd41(); }

});
}));
diagnosticStage10();


    const diagnosticStage11 = diagnostics?.start?.("settings.render.billing") ?? (() => {});
new Setting(containerEl).setName("Billing").setHeading();
diagnosticStage11();

    const diagnosticStage12 = diagnostics?.start?.("settings.render.stage_3") ?? (() => {});
containerEl.createEl("p", {
      text: "AI actions use one credit per input character. Each account includes 2,000 free characters on the account, shared across installations. Purchase more credits below.",
    });
diagnosticStage12();

    const diagnosticStage13 = diagnostics?.start?.("settings.render.stage_4") ?? (() => {});
this.creditsSummaryEl = containerEl.createEl("p", { cls: "torbert-credits-summary" });
diagnosticStage13();

    const diagnosticStage14 = diagnostics?.start?.("settings.render.stage_5") ?? (() => {});
this.renderCreditsSummary();
diagnosticStage14();

    const diagnosticStage15 = diagnostics?.start?.("settings.render.stage_6") ?? (() => {});
this.plugin.refreshBillingCredits = () => this.renderCreditsSummary();
diagnosticStage15();


    const diagnosticStage16 = diagnostics?.start?.("settings.render.account") ?? (() => {});
addBillingAccountSettings(containerEl, { state: this.plugin.settings, appId: "torbert-text-ai-obsidian", installationId: this.plugin.settings.constanceDeviceId, appVersion: this.plugin.manifest.version, persist: () => this.plugin.saveSettings(), syncBalance: () => syncPurchasedCharactersFromConstance(this.plugin), refresh: () => this.display() });
diagnosticStage16();

    const diagnosticStage17 = diagnostics?.start?.("settings.render.stage_7") ?? (() => {});
addLivePacks(containerEl,this.plugin);
diagnosticStage17();


    const diagnosticStage18 = diagnostics?.start?.("settings.render.refresh_balance") ?? (() => {});
new Setting(containerEl)
      .setName("Refresh balance")
      .setDesc("Update your purchased character balance.")
      .addButton((button) =>
        button.setButtonText("Refresh balance").onClick(async () => {
return diagnostics.guard("settings-tab.control_5", async () => {
const diagnosticEnd42 = diagnostics?.start?.("control.refresh_balance.onClick") ?? (() => {});
try {

          button.setDisabled(true);
          button.setButtonText("Refreshing...");
          try { await syncPurchasedCharactersFromConstance(this.plugin, true); this.renderCreditsSummary(); }
          catch (caughtError6) {
diagnostics.failure("settings-tab.caught_7", caughtError6); new Notice("Could not refresh balance. Please try again."); }
          finally { button.setDisabled(false); button.setButtonText("Refresh balance"); }

} catch (diagnosticError42) { diagnostics?.failure?.("control.refresh_balance.onClick", diagnosticError42); throw diagnosticError42; } finally { diagnosticEnd42(); }

});
}),
      );
diagnosticStage18();


    // Sync on open so the summary reflects a purchase made since last time
    // Obsidian was open, without requiring a manual refresh click.
    const diagnosticStage19 = diagnostics?.start?.("settings.render.stage_8") ?? (() => {});
void diagnostics.guard("settings-tab.background_8", () => (syncPurchasedCharactersFromConstance(this.plugin).then(() => this.renderCreditsSummary()).catch((rejectedError1) => {
diagnostics.failure("settings-tab.rejected_2", rejectedError1);})));
diagnosticStage19();


    const diagnosticStage20 = diagnostics?.start?.("settings.render.stage_9") ?? (() => {});
if (this.plugin.settings.settingsMode !== "advanced") return;
diagnosticStage20();

    const diagnosticStage21 = diagnostics?.start?.("settings.render.stage_10") ?? (() => {});
this.plugin.support.addDiagnosticsSetting(containerEl);
diagnosticStage21();

    const diagnosticStage22 = diagnostics?.start?.("settings.render.menus_and_toolbar") ?? (() => {});
new Setting(containerEl).setName("Menus and toolbar").setHeading();
diagnosticStage22();


    const diagnosticStage23 = diagnostics?.start?.("settings.render.show_ribbon_icon") ?? (() => {});
new Setting(containerEl)
      .setName("Show ribbon icon")
      .setDesc('Toggle the visibility of the "Bold to Highlight" icon in the left ribbon bar. You may need to reload Obsidian for this to take effect.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showRibbonIcon)
        .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_9", async () => {
const diagnosticEnd43 = diagnostics?.start?.("control.show_ribbon_icon.onChange") ?? (() => {});
try {

          this.plugin.settings.showRibbonIcon = value;
          await this.plugin.saveSettings();

} catch (diagnosticError43) { diagnostics?.failure?.("control.show_ribbon_icon.onChange", diagnosticError43); throw diagnosticError43; } finally { diagnosticEnd43(); }

});
}));
diagnosticStage23();


    const diagnosticStage24 = diagnostics?.start?.("settings.render.stage_11") ?? (() => {});
new Setting(containerEl)
      .setName('Show "Bold to Highlight" in context menu')
      .setDesc('Show the primary "Torbert Bold to Highlight" command at the top level of the right-click context menu.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showContextMenuSingle)
        .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_10", async () => {
const diagnosticEnd44 = diagnostics?.start?.("control.5785.onChange") ?? (() => {});
try {

          this.plugin.settings.showContextMenuSingle = value;
          await this.plugin.saveSettings();

} catch (diagnosticError44) { diagnostics?.failure?.("control.5785.onChange", diagnosticError44); throw diagnosticError44; } finally { diagnosticEnd44(); }

});
}));
diagnosticStage24();


    const diagnosticStage25 = diagnostics?.start?.("settings.render.stage_12") ?? (() => {});
new Setting(containerEl)
      .setName('Show "Torbert Text AI" submenu')
      .setDesc('Show the submenu containing all text transformations in the right-click context menu.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showContextMenuSubmenu)
        .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_11", async () => {
const diagnosticEnd45 = diagnostics?.start?.("control.6223.onChange") ?? (() => {});
try {

          this.plugin.settings.showContextMenuSubmenu = value;
          await this.plugin.saveSettings();

} catch (diagnosticError45) { diagnostics?.failure?.("control.6223.onChange", diagnosticError45); throw diagnosticError45; } finally { diagnosticEnd45(); }

});
}));
diagnosticStage25();


    const diagnosticStage26 = diagnostics?.start?.("settings.render.privacy_diagnostics") ?? (() => {});
new Setting(containerEl).setName("Privacy & diagnostics").setHeading();
diagnosticStage26();

    const diagnosticStage27 = diagnostics?.start?.("settings.render.stage_13") ?? (() => {});
containerEl.createEl("p", {
      text: "Torbert has no analytics or advertising. On startup it checks this install's purchased-character balance with TutivSoft. Debug logging is separate and off by default.",
    });
diagnosticStage27();


    const diagnosticStage28 = diagnostics?.start?.("settings.render.enable_debug_logging") ?? (() => {});
new Setting(containerEl)
      .setName("Enable debug logging")
      .setDesc('Off by default. When enabled, writes operation details such as file paths and AI usage to "plugin.log" in the plugin directory for troubleshooting.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enableLogging)
        .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_12", async () => {
const diagnosticEnd46 = diagnostics?.start?.("control.enable_debug_logging.onChange") ?? (() => {});
try {

          this.plugin.settings.enableLogging = value;
          await this.plugin.saveSettings();

} catch (diagnosticError46) { diagnostics?.failure?.("control.enable_debug_logging.onChange", diagnosticError46); throw diagnosticError46; } finally { diagnosticEnd46(); }

});
}));
diagnosticStage28();


    const diagnosticStage29 = diagnostics?.start?.("settings.render.ai_features") ?? (() => {});
new Setting(containerEl).setName("AI features").setHeading();
diagnosticStage29();


    const diagnosticStage30 = diagnostics?.start?.("settings.render.provider") ?? (() => {});
new Setting(containerEl).setName("Provider").setHeading();
diagnosticStage30();


    const diagnosticStage31 = diagnostics?.start?.("settings.render.openrouter_api_key") ?? (() => {});
new Setting(containerEl)
      .setName("OpenRouter API key")
      .setDesc("Optional. Enter your OpenRouter API key, or leave blank to use the included AI connection.")
      .addText((text) => text
        .setPlaceholder("sk-...")
        .setValue(this.plugin.settings.openAiApiKey)
        .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_13", async () => {
const diagnosticEnd47 = diagnostics?.start?.("control.openrouter_api_key.onChange") ?? (() => {});
try {

          this.plugin.settings.openAiApiKey = value;
          await this.plugin.saveSettings();

} catch (diagnosticError47) { diagnostics?.failure?.("control.openrouter_api_key.onChange", diagnosticError47); throw diagnosticError47; } finally { diagnosticEnd47(); }

});
}));
diagnosticStage31();


    const diagnosticStage32 = diagnostics?.start?.("settings.render.ai_model") ?? (() => {});
new Setting(containerEl).setName("AI model").setDesc("The AI model is selected automatically.");
diagnosticStage32();


    const diagnosticStage33 = diagnostics?.start?.("settings.render.keyword_highlighting") ?? (() => {});
new Setting(containerEl).setName("Keyword highlighting").setHeading();
diagnosticStage33();


    const diagnosticStage34 = diagnostics?.start?.("settings.render.keywords") ?? (() => {});
new Setting(containerEl)
      .setName("Keywords")
      .setDesc("Comma-separated or newline-separated keywords to wrap with Obsidian highlights.")
      .addTextArea((text) => text
        .setPlaceholder("important, urgent, follow up")
        .setValue(this.plugin.settings.highlightKeywords)
        .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_14", async () => {
const diagnosticEnd48 = diagnostics?.start?.("control.keywords.onChange") ?? (() => {});
try {

          this.plugin.settings.highlightKeywords = value;
          await this.plugin.saveSettings();

} catch (diagnosticError48) { diagnostics?.failure?.("control.keywords.onChange", diagnosticError48); throw diagnosticError48; } finally { diagnosticEnd48(); }

});
}));
diagnosticStage34();


    const diagnosticStage35 = diagnostics?.start?.("settings.render.ai_classification_folders") ?? (() => {});
new Setting(containerEl)
      .setName("AI classification folders")
      .setDesc("Newline- or comma-separated folder names for AI Folder Classification.")
      .addTextArea((text) => text
        .setPlaceholder("Jobs\nClients\nDevOps\nFinance")
        .setValue(this.plugin.settings.folderClassificationFolders)
        .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_15", async () => {
const diagnosticEnd49 = diagnostics?.start?.("control.ai_classification_folders.onChange") ?? (() => {});
try {

          this.plugin.settings.folderClassificationFolders = value;
          await this.plugin.saveSettings();

} catch (diagnosticError49) { diagnostics?.failure?.("control.ai_classification_folders.onChange", diagnosticError49); throw diagnosticError49; } finally { diagnosticEnd49(); }

});
}));
diagnosticStage35();


    const diagnosticStage36 = diagnostics?.start?.("settings.render.custom_prompt_presets") ?? (() => {});
new Setting(containerEl)
      .setName("Custom prompt presets")
      .setDesc('JSON array of named prompts. Example: [{"name":"Job Search cleanup","prompt":"Clean this note..."}]')
      .addTextArea((text) => text
        .setPlaceholder('[{"name":"Job Search cleanup","prompt":"Clean this note..."}]')
        .setValue(JSON.stringify(this.plugin.settings.customPromptPresets, null, 2))
        .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_16", async () => {
const diagnosticEnd50 = diagnostics?.start?.("control.custom_prompt_presets.onChange") ?? (() => {});
try {

          try {
            const parsed = JSON.parse(value) as Array<{ name?: string; prompt?: string }>;
            if (!Array.isArray(parsed) || parsed.some(preset => !preset || typeof preset !== "object")) throw new Error("Expected an array of named prompts");
            text.inputEl.setCustomValidity("");
            this.plugin.settings.customPromptPresets = parsed
              .map((preset) => ({
                name: String(preset.name || "").trim(),
                prompt: String(preset.prompt || "").trim(),
              }))
              .filter((preset) => preset.name && preset.prompt);
            await this.plugin.saveSettings();
          } catch (caughtError17) {
diagnostics.failure("settings-tab.caught_18", caughtError17);
            text.inputEl.setCustomValidity("Use a JSON array of objects with name and prompt. Your last valid presets are kept.");
          }

} catch (diagnosticError50) { diagnostics?.failure?.("control.custom_prompt_presets.onChange", diagnosticError50); throw diagnosticError50; } finally { diagnosticEnd50(); }

});
}));
diagnosticStage36();


    const diagnosticStage37 = diagnostics?.start?.("settings.render.transformation_menu") ?? (() => {});
new Setting(containerEl)
      .setName("Transformation menu")
      .setDesc('Choose which transformations appear in the "Torbert Text AI" context submenu. Command-palette entries remain available.')
      .setHeading();
diagnosticStage37();


    const diagnosticStage38 = diagnostics?.start?.("settings.render.stage_14") ?? (() => {});
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
          .setDesc("Show this action in the context submenu. It remains available in the command palette.")
          .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.enabledTransformations[transformationId] ?? true)
            .onChange(async (value) => {
return diagnostics.guard("settings-tab.control_19", async () => {
const diagnosticEnd51 = diagnostics?.start?.("control.11149.onChange") ?? (() => {});
try {

              this.plugin.settings.enabledTransformations[transformationId] = value;
              await this.plugin.saveSettings();

} catch (diagnosticError51) { diagnostics?.failure?.("control.11149.onChange", diagnosticError51); throw diagnosticError51; } finally { diagnosticEnd51(); }

});
}));
      });
    });
diagnosticStage38();


}; return diagnostics?.run ? diagnostics.run("settings.open", diagnosticAction2) : diagnosticAction2();

});
}

  hide(): void { const end = diagnostics?.start?.("settings.close") ?? (() => {}); try { super.hide(); } finally { end(); } }
}
