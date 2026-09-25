import { App, ButtonComponent, Modal, Notice } from "obsidian";

export interface AiQueueUpdate {
  label?: string;
  submittedText?: string;
  current?: number;
  total?: number;
}

export type QueueReporter = (update: AiQueueUpdate) => void;
interface QueueJob<T = unknown> {
  id: number;
  label: string;
  submittedText: string;
  queuedAt: number;
  startedAt?: number;
  statusLabel: string;
  current?: number;
  total?: number;
  run: (report: QueueReporter) => Promise<T>;
  resolve: (result: QueueResult<T>) => void;
}
export type QueueResult<T> = { status: "completed"; value: T } | { status: "cleared" } | { status: "failed"; error: unknown };

/** Serializes AI work and keeps the active request and waiting queue visible. */
export class AiRequestQueue extends Modal {
  private pending: QueueJob<any>[] = [];
  private active: QueueJob<any> | null = null;
  private running = false;
  private opened = false;
  private nextId = 1;
  private timer: number | null = null;
  private lastCompletion = "";

  constructor(app: App, private readonly appName: string) { super(app); }

  onOpen(): void {
    this.opened = true;
    this.startTimer();
    this.render();
  }

  onClose(): void {
    this.opened = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.contentEl.empty();
  }

  enqueue<T>(label: string, submittedText: string, run: (report: QueueReporter) => Promise<T>): Promise<QueueResult<T>> {
    return new Promise((resolve) => {
      const job: QueueJob<T> = {
        id: this.nextId++, label, submittedText, queuedAt: Date.now(), statusLabel: "Waiting",
        run, resolve,
      };
      this.pending.push(job);
      if (!this.opened) this.open();
      this.render();
      void this.drain();
    });
  }

  private startTimer(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.render(), 1000);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const job = this.pending.shift()!;
        this.active = job;
        job.startedAt = Date.now();
        job.statusLabel = "Preparing request";
        this.render();
        const report: QueueReporter = (update) => {
          if (this.active?.id !== job.id) return;
          if (update.label !== undefined) job.statusLabel = update.label;
          if (update.submittedText !== undefined) job.submittedText = update.submittedText;
          if (update.current !== undefined) job.current = update.current;
          if (update.total !== undefined) job.total = update.total;
          this.render();
        };
        try {
          const value = await job.run(report);
          const elapsed = Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000));
          this.lastCompletion = `${job.label} completed in ${elapsed} second${elapsed === 1 ? "" : "s"}.`;
          new Notice(`${this.appName}: ${this.lastCompletion}`, 4000);
          job.resolve({ status: "completed", value });
        } catch (error) {
          const elapsed = Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000));
          const detail = error instanceof Error ? error.message : "Unknown error";
          this.lastCompletion = `${job.label} failed after ${elapsed} second${elapsed === 1 ? "" : "s"}: ${detail}`;
          new Notice(`${this.appName}: ${job.label} failed. ${detail}`, 6000);
          job.resolve({ status: "failed", error });
        } finally {
          this.active = null;
          this.render();
        }
      }
    } finally {
      this.running = false;
    }
  }

  private clearWaiting(): void {
    const removed = this.pending.splice(0);
    for (const job of removed) job.resolve({ status: "cleared" });
    if (removed.length) {
      this.lastCompletion = `${removed.length} waiting AI request${removed.length === 1 ? " was" : "s were"} removed.`;
      new Notice(`${this.appName}: cleared ${removed.length} waiting AI request${removed.length === 1 ? "" : "s"}.`, 4000);
      this.render();
    }
  }

  private render(): void {
    if (!this.opened) return;
    const root = this.contentEl;
    root.empty();
    root.createEl("h2", { text: `${this.appName} AI request queue` });
    if (this.active) {
      const elapsed = Math.max(0, Math.floor((Date.now() - (this.active.startedAt ?? Date.now())) / 1000));
      const active = root.createDiv();
      active.createEl("h3", { text: `Processing: ${this.active.label}` });
      active.createEl("p", { text: `${this.active.statusLabel} · ${elapsed} second${elapsed === 1 ? "" : "s"} elapsed${this.active.current && this.active.total ? ` · ${this.active.current}/${this.active.total}` : ""}` });
      active.createEl("p", { text: "Text sent to AI (excerpt)" });
      const excerpt = active.createEl("pre", { text: this.active.submittedText.trim().slice(0, 320) || "Preparing the text to send…" });
      excerpt.style.whiteSpace = "pre-wrap";
      excerpt.style.maxHeight = "12em";
      excerpt.style.overflow = "auto";
    } else {
      root.createEl("p", { text: "No AI request is processing." });
    }

    root.createEl("h3", { text: `Waiting (${this.pending.length})` });
    if (!this.pending.length) root.createEl("p", { text: "The waiting queue is empty." });
    for (const [index, job] of this.pending.entries()) {
      const item = root.createDiv();
      item.createEl("p", { text: `${index + 1}. ${job.label}` });
      item.createEl("pre", { text: job.submittedText.trim().slice(0, 180) || "Text will be shown when this request starts." }).style.whiteSpace = "pre-wrap";
    }
    if (this.lastCompletion) root.createEl("p", { text: this.lastCompletion });
    const footer = root.createDiv();
    new ButtonComponent(footer).setButtonText("Clear waiting requests").setWarning().setDisabled(this.pending.length === 0).onClick(() => this.clearWaiting());
    new ButtonComponent(footer).setButtonText("Close").onClick(() => this.close());
    root.createEl("p", { text: "Clearing removes waiting requests. The active request will finish." }).style.color = "var(--text-muted)";
  }
}
