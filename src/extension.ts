import * as vscode from "vscode";
import { initLogger, getLogger, disposeLogger, log } from "./logger";
import { KtfmtFormattingProvider, handleFormatError } from "./provider";
import { formatWithKtfmt } from "./formatter";
import { forceDownloadJar, resolveJarPath } from "./jar";
import { SUPPORTED_KTFMT_VERSION } from "./ktfmtVersions";
import { getConfig } from "./config";

const KOTLIN_LANGUAGES = ["kotlin", "kotlin-script"];

export function activate(context: vscode.ExtensionContext): void {
  initLogger();
  log(
    `vscode-ktfmt activated (supported ktfmt version: ${SUPPORTED_KTFMT_VERSION}).`,
  );

  const provider = new KtfmtFormattingProvider(context);
  for (const language of KOTLIN_LANGUAGES) {
    for (const scheme of ["file", "untitled"]) {
      context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
          { language, scheme },
          provider,
        ),
      );
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("ktfmt.format", () =>
      runFormatCommand(context),
    ),
    vscode.commands.registerCommand("ktfmt.downloadJar", () =>
      runDownloadCommand(context),
    ),
    vscode.commands.registerCommand("ktfmt.showJarPath", () =>
      runShowJarPathCommand(context),
    ),
    vscode.commands.registerCommand("ktfmt.showLogs", () =>
      getLogger().show(true),
    ),
  );
}

export function deactivate(): void {
  disposeLogger();
}

async function runFormatCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("ktfmt: no active editor.");
    return;
  }
  const doc = editor.document;
  if (!KOTLIN_LANGUAGES.includes(doc.languageId)) {
    vscode.window.showWarningMessage(
      `ktfmt: active file is not Kotlin (languageId: ${doc.languageId}).`,
    );
    return;
  }

  try {
    const original = doc.getText();
    const formatted = await formatWithKtfmt(context, original);
    if (formatted === original) return;
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(original.length),
    );
    await editor.edit((edit) => edit.replace(fullRange, formatted));
  } catch (err) {
    handleFormatError(err);
  }
}

async function runDownloadCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  const cfg = getConfig();
  if (cfg.jarPath.trim().length > 0) {
    vscode.window.showInformationMessage(
      "ktfmt.jarPath is set; download skipped. Clear the setting to use the bundled version.",
    );
    return;
  }
  try {
    const path = await forceDownloadJar(context);
    vscode.window.showInformationMessage(
      `ktfmt ${SUPPORTED_KTFMT_VERSION} downloaded to ${path}.`,
    );
  } catch (err) {
    handleFormatError(err);
  }
}

async function runShowJarPathCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const jarPath = await resolveJarPath(context);
    const choice = await vscode.window.showInformationMessage(
      `ktfmt JAR: ${jarPath}`,
      "Reveal in Finder",
      "Copy Path",
    );
    if (choice === "Reveal in Finder") {
      await vscode.commands.executeCommand(
        "revealFileInOS",
        vscode.Uri.file(jarPath),
      );
    } else if (choice === "Copy Path") {
      await vscode.env.clipboard.writeText(jarPath);
    }
  } catch (err) {
    handleFormatError(err);
  }
}
