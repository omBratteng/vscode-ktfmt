import * as vscode from "vscode";
import { formatWithKtfmt, FormatterError } from "./formatter";
import { JarError } from "./jar";
import { logError } from "./logger";

export class KtfmtFormattingProvider
  implements vscode.DocumentFormattingEditProvider
{
  constructor(private readonly context: vscode.ExtensionContext) {}

  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): Promise<vscode.TextEdit[]> {
    try {
      const original = document.getText();
      const formatted = await formatWithKtfmt(this.context, original, token);
      if (formatted === original) return [];
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(original.length),
      );
      return [vscode.TextEdit.replace(fullRange, formatted)];
    } catch (err) {
      handleFormatError(err);
      return [];
    }
  }
}

export function handleFormatError(err: unknown): void {
  if (err instanceof FormatterError) {
    if (err.kind === "cancelled") return;
    logError("ktfmt formatting failed", err);
    if (err.kind === "java-not-found") {
      showJavaError(err.message);
    } else if (err.kind === "ktfmt-failed") {
      showFormatFailure();
    } else {
      vscode.window
        .showErrorMessage(err.message, "View Logs")
        .then((choice) => {
          if (choice === "View Logs")
            vscode.commands.executeCommand("ktfmt.showLogs");
        });
    }
    return;
  }
  if (err instanceof JarError) {
    logError("ktfmt JAR error", err);
    if (err.kind === "cancelled") return;
    if (err.kind === "jar-missing") {
      vscode.window
        .showErrorMessage(err.message, "Open Settings", "View Logs")
        .then((choice) => {
          if (choice === "Open Settings") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "ktfmt.jarPath",
            );
          } else if (choice === "View Logs") {
            vscode.commands.executeCommand("ktfmt.showLogs");
          }
        });
      return;
    }
    if (err.kind === "hash-mismatch") {
      vscode.window
        .showErrorMessage(err.message, "Retry", "View Logs")
        .then((choice) => {
          if (choice === "Retry") {
            vscode.commands.executeCommand("ktfmt.downloadJar");
          } else if (choice === "View Logs") {
            vscode.commands.executeCommand("ktfmt.showLogs");
          }
        });
      return;
    }
    vscode.window
      .showErrorMessage(err.message, "Retry", "Open Settings", "View Logs")
      .then((choice) => {
        if (choice === "Retry") {
          vscode.commands.executeCommand("ktfmt.downloadJar");
        } else if (choice === "Open Settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "ktfmt.jarPath",
          );
        } else if (choice === "View Logs") {
          vscode.commands.executeCommand("ktfmt.showLogs");
        }
      });
    return;
  }

  logError("Unexpected ktfmt error", err);
  vscode.window
    .showErrorMessage(
      `ktfmt: ${err instanceof Error ? err.message : String(err)}`,
      "View Logs",
    )
    .then((choice) => {
      if (choice === "View Logs")
        vscode.commands.executeCommand("ktfmt.showLogs");
    });
}

function showJavaError(message: string): void {
  vscode.window
    .showErrorMessage(message, "Open Settings", "View Logs")
    .then((choice) => {
      if (choice === "Open Settings") {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "ktfmt.javaHome",
        );
      } else if (choice === "View Logs") {
        vscode.commands.executeCommand("ktfmt.showLogs");
      }
    });
}

function showFormatFailure(): void {
  vscode.window
    .showErrorMessage("ktfmt failed to format the file.", "View Logs")
    .then((choice) => {
      if (choice === "View Logs")
        vscode.commands.executeCommand("ktfmt.showLogs");
    });
}
