import * as vscode from "vscode";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { getConfig, KtfmtStyle } from "./config";
import { resolveJarPath, expandPath } from "./jar";
import { log, logError, getLogger } from "./logger";

export class FormatterError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "java-not-found"
      | "jar-error"
      | "ktfmt-failed"
      | "cancelled",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FormatterError";
  }
}

const STYLE_FLAG: Record<KtfmtStyle, string | undefined> = {
  meta: undefined, // default style, no flag
  google: "--google-style",
  kotlinlang: "--kotlinlang-style",
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function javaBinName(): string {
  return process.platform === "win32" ? "java.exe" : "java";
}

/**
 * Resolve which `java` binary to invoke. Resolution order:
 *   1. `ktfmt.javaHome` setting
 *   2. `JAVA_HOME` environment variable
 *   3. `java` on PATH
 */
async function resolveJava(): Promise<string> {
  const cfg = getConfig();
  const bin = javaBinName();

  if (cfg.javaHome.trim().length > 0) {
    const home = expandPath(cfg.javaHome.trim());
    const candidate = path.join(home, "bin", bin);
    if (await fileExists(candidate)) return candidate;
    throw new FormatterError(
      `Java binary not found at "${candidate}". Update the \`ktfmt.javaHome\` setting.`,
      "java-not-found",
    );
  }

  const envHome = process.env.JAVA_HOME;
  if (envHome && envHome.trim().length > 0) {
    const candidate = path.join(envHome, "bin", bin);
    if (await fileExists(candidate)) return candidate;
    log(
      `JAVA_HOME is set to "${envHome}" but no Java binary was found there; falling back to PATH.`,
    );
  }

  return bin;
}

function buildArgs(jarPath: string): string[] {
  const cfg = getConfig();
  const args = ["-jar", jarPath];
  const styleFlag = STYLE_FLAG[cfg.style];
  if (styleFlag) args.push(styleFlag);
  if (cfg.maxWidth != null && Number.isFinite(cfg.maxWidth)) {
    args.push(`--max-width=${cfg.maxWidth}`);
  }
  if (!cfg.removeUnusedImports) args.push("--do-not-remove-unused-imports");
  if (cfg.enableEditorConfig) args.push("--enable-editorconfig");
  if (cfg.extraArgs.length > 0) args.push(...cfg.extraArgs);
  args.push("-"); // read from stdin, write to stdout
  return args;
}

export async function formatWithKtfmt(
  context: vscode.ExtensionContext,
  input: string,
  token?: vscode.CancellationToken,
): Promise<string> {
  const java = await resolveJava();
  const jarPath = await resolveJarPath(context);
  const args = buildArgs(jarPath);

  log(`Running: ${java} ${args.map((a) => JSON.stringify(a)).join(" ")}`);

  return new Promise<string>((resolve, reject) => {
    let child;
    try {
      child = spawn(java, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      reject(
        new FormatterError(
          `Failed to spawn java: ${(err as Error).message}`,
          "java-not-found",
          err,
        ),
      );
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const cancellation = token?.onCancellationRequested(() => {
      child.kill();
      settle(() =>
        reject(new FormatterError("Formatting cancelled.", "cancelled")),
      );
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      cancellation?.dispose();
      const isEnoent = (err as NodeJS.ErrnoException).code === "ENOENT";
      settle(() =>
        reject(
          new FormatterError(
            isEnoent
              ? `Could not locate Java executable "${java}".`
              : `Failed to run java: ${err.message}`,
            "java-not-found",
            err,
          ),
        ),
      );
    });

    child.on("close", (code) => {
      cancellation?.dispose();
      if (code === 0) {
        settle(() => resolve(stdout));
      } else {
        if (stderr.trim().length > 0) {
          getLogger().appendLine(`ktfmt stderr:\n${stderr.trimEnd()}`);
        }
        settle(() =>
          reject(
            new FormatterError(
              `ktfmt exited with code ${code}.`,
              "ktfmt-failed",
            ),
          ),
        );
      }
    });

    child.stdin.on("error", (err) => {
      logError("Failed writing to ktfmt stdin", err);
    });
    child.stdin.end(input, "utf8");
  });
}
