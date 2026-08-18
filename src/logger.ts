import type { DataAdapter } from "obsidian";

type LogLevel = "INFO" | "WARN" | "ERROR";

export class FileLogger {
  private isEnabled = true;

  constructor(
    private readonly adapter: DataAdapter,
    private readonly logFilePath: string,
  ) {}

  setEnabled(isEnabled: boolean): void {
    this.isEnabled = isEnabled;
  }

  info(source: string, message: string, ...details: unknown[]): void {
    void this.writeLog("INFO", source, message, ...details);
  }

  warn(source: string, message: string, ...details: unknown[]): void {
    void this.writeLog("WARN", source, message, ...details);
  }

  error(source: string, message: string, ...details: unknown[]): void {
    void this.writeLog("ERROR", source, message, ...details);
  }

  private formatMessage(level: LogLevel, source: string, message: string, ...details: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedDetails = details.map((detail) => {
      if (typeof detail === "object") {
        try {
          return JSON.stringify(detail);
        } catch {
          return "Unserializable Object";
        }
      }

      return String(detail);
    }).join(" ");

    return `[${timestamp}] [${level}] [${source}] - ${message} ${formattedDetails}\n`;
  }

  private async writeLog(level: LogLevel, source: string, message: string, ...details: unknown[]): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const logMessage = this.formatMessage(level, source, message, ...details);

      switch (level) {
        case "INFO":
          console.log(`[${source}] - ${message}`, ...details);
          break;
        case "WARN":
          console.warn(`[${source}] - ${message}`, ...details);
          break;
        case "ERROR":
          console.error(`[${source}] - ${message}`, ...details);
          break;
      }

      await this.adapter.append(this.logFilePath, logMessage);
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }
}
