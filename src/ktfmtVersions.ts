/**
 * The ktfmt version this extension is built against. When this constant is
 * bumped (typically alongside an extension release), the cached JAR file in
 * the user's globalStorage will no longer match the expected name and a fresh
 * download is triggered automatically on the next format invocation.
 */
export const SUPPORTED_KTFMT_VERSION = "0.62";

/**
 * SHA-256 checksums for known ktfmt fat JAR releases. Used to verify the
 * integrity of downloaded artifacts.
 */
export const KTFMT_SHA256: Record<string, string> = {
  "0.62": "9c7e2408a03b3582f162449dbab2dfabcc8d09de1609a9831e4c683d1207de01",
};

export const ktfmtJarUrl = (version: string): string =>
  `https://repo1.maven.org/maven2/com/facebook/ktfmt/${version}/ktfmt-${version}-with-dependencies.jar`;

export const ktfmtJarFileName = (version: string): string =>
  `ktfmt-${version}.jar`;
