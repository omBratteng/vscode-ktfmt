import * as vscode from "vscode";

export type KtfmtStyle = "meta" | "google" | "kotlinlang";

export interface KtfmtConfig {
  style: KtfmtStyle;
  javaHome: string;
  jarPath: string;
  extraArgs: string[];
  maxWidth: number | null;
  removeUnusedImports: boolean;
  enableEditorConfig: boolean;
}

export function getConfig(): KtfmtConfig {
  const c = vscode.workspace.getConfiguration("ktfmt");
  return {
    style: c.get<KtfmtStyle>("style", "kotlinlang"),
    javaHome: c.get<string>("javaHome", ""),
    jarPath: c.get<string>("jarPath", ""),
    extraArgs: c.get<string[]>("extraArgs", []),
    maxWidth: c.get<number | null>("maxWidth", null),
    removeUnusedImports: c.get<boolean>("removeUnusedImports", true),
    enableEditorConfig: c.get<boolean>("enableEditorConfig", false),
  };
}
