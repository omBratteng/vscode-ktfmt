import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function initLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("ktfmt");
  }
  return channel;
}

export function getLogger(): vscode.OutputChannel {
  return initLogger();
}

export function log(message: string): void {
  const ts = new Date().toISOString();
  getLogger().appendLine(`[${ts}] ${message}`);
}

export function logError(message: string, err: unknown): void {
  const ts = new Date().toISOString();
  const detail =
    err instanceof Error
      ? `${err.message}${err.stack ? `\n${err.stack}` : ""}`
      : String(err);
  getLogger().appendLine(`[${ts}] ERROR ${message}: ${detail}`);
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}
