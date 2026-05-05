import * as vscode from "vscode";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as https from "https";
import { URL } from "url";
import {
  SUPPORTED_KTFMT_VERSION,
  KTFMT_SHA256,
  ktfmtJarUrl,
  ktfmtJarFileName,
} from "./ktfmtVersions";
import { getConfig } from "./config";
import { log, logError } from "./logger";

const MAX_REDIRECTS = 5;

let inFlightDownload: Promise<string> | undefined;

/**
 * Expand a leading `~` and environment variables (`$VAR` or `${VAR}`) in a path.
 */
export function expandPath(p: string): string {
  if (!p) return p;
  let out = p;
  if (out.startsWith("~")) {
    out = path.join(os.homedir(), out.slice(1));
  }
  out = out.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, a, b) => {
    const name = a ?? b;
    return process.env[name] ?? "";
  });
  return out;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function sha256OfFile(p: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(p);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

/**
 * Resolve the JAR path to use for ktfmt. Triggers a download when the cached
 * file is missing or its hash does not match the expected value.
 */
export async function resolveJarPath(
  context: vscode.ExtensionContext,
): Promise<string> {
  const cfg = getConfig();

  if (cfg.jarPath.trim().length > 0) {
    const expanded = expandPath(cfg.jarPath.trim());
    const resolved = path.isAbsolute(expanded)
      ? expanded
      : path.resolve(expanded);
    if (!(await fileExists(resolved))) {
      throw new JarError(
        `ktfmt JAR not found at "${resolved}". Update the \`ktfmt.jarPath\` setting.`,
        "jar-missing",
      );
    }
    return resolved;
  }

  const storageDir = context.globalStorageUri.fsPath;
  await fsp.mkdir(storageDir, { recursive: true });
  const target = path.join(
    storageDir,
    ktfmtJarFileName(SUPPORTED_KTFMT_VERSION),
  );

  const expectedHash = KTFMT_SHA256[SUPPORTED_KTFMT_VERSION];

  if (await fileExists(target)) {
    if (!expectedHash) {
      return target;
    }
    try {
      const actual = await sha256OfFile(target);
      if (actual.toLowerCase() === expectedHash.toLowerCase()) {
        return target;
      }
      log(
        `Cached ktfmt JAR hash mismatch (expected ${expectedHash}, got ${actual}); re-downloading.`,
      );
      await fsp.unlink(target).catch(() => undefined);
    } catch (err) {
      logError("Failed to hash cached ktfmt JAR", err);
      await fsp.unlink(target).catch(() => undefined);
    }
  }

  if (inFlightDownload) {
    return inFlightDownload;
  }

  inFlightDownload = downloadJar(target, SUPPORTED_KTFMT_VERSION).finally(
    () => {
      inFlightDownload = undefined;
    },
  );
  return inFlightDownload;
}

/**
 * Forcefully delete and re-download the JAR for the supported version.
 */
export async function forceDownloadJar(
  context: vscode.ExtensionContext,
): Promise<string> {
  const storageDir = context.globalStorageUri.fsPath;
  await fsp.mkdir(storageDir, { recursive: true });
  const target = path.join(
    storageDir,
    ktfmtJarFileName(SUPPORTED_KTFMT_VERSION),
  );
  await fsp.unlink(target).catch(() => undefined);
  return downloadJar(target, SUPPORTED_KTFMT_VERSION);
}

async function downloadJar(target: string, version: string): Promise<string> {
  const url = ktfmtJarUrl(version);
  const tmp = `${target}.tmp`;
  await fsp.unlink(tmp).catch(() => undefined);

  log(`Downloading ktfmt ${version} from ${url}`);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Downloading ktfmt ${version}`,
      cancellable: true,
    },
    async (progress, token) => {
      await streamDownload(url, tmp, progress, token);
    },
  );

  const expectedHash = KTFMT_SHA256[version];
  if (expectedHash) {
    const actual = await sha256OfFile(tmp);
    if (actual.toLowerCase() !== expectedHash.toLowerCase()) {
      await fsp.unlink(tmp).catch(() => undefined);
      throw new JarError(
        `ktfmt JAR integrity check failed (expected ${expectedHash}, got ${actual}).`,
        "hash-mismatch",
      );
    }
  }

  await fsp.rename(tmp, target);
  log(`ktfmt ${version} ready at ${target}`);
  return target;
}

function streamDownload(
  url: string,
  destination: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken,
  redirectsLeft = MAX_REDIRECTS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          "User-Agent": "vscode-ktfmt",
          Accept: "*/*",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          streamDownload(
            next,
            destination,
            progress,
            token,
            redirectsLeft - 1,
          ).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(
            new JarError(
              `Download failed: HTTP ${status} for ${url}`,
              "download-failed",
            ),
          );
          return;
        }

        const total = Number(res.headers["content-length"] ?? "0");
        let received = 0;
        let lastReportedPct = 0;

        const file = fs.createWriteStream(destination);
        const cleanup = (err?: unknown) => {
          file.close(() => {
            fsp.unlink(destination).catch(() => undefined);
            if (err) reject(err);
          });
        };

        token.onCancellationRequested(() => {
          req.destroy();
          res.destroy();
          cleanup(new JarError("Download cancelled.", "cancelled"));
        });

        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.floor((received / total) * 100);
            if (pct > lastReportedPct) {
              progress.report({
                message: `${pct}% (${formatBytes(received)} / ${formatBytes(total)})`,
                increment: pct - lastReportedPct,
              });
              lastReportedPct = pct;
            }
          } else {
            progress.report({ message: formatBytes(received) });
          }
        });

        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (err) => cleanup(err));
        res.on("error", (err) => cleanup(err));
      },
    );
    req.on("error", (err) =>
      reject(
        new JarError(
          `Download failed: ${err.message}`,
          "download-failed",
          err,
        ),
      ),
    );
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

export type JarErrorKind =
  | "jar-missing"
  | "download-failed"
  | "hash-mismatch"
  | "cancelled";

export class JarError extends Error {
  constructor(
    message: string,
    public readonly kind: JarErrorKind,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "JarError";
  }
}
