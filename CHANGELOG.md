# Changelog

## 0.1.0

- Initial release.
- Document formatting provider for `.kt` and `.kts`.
- Auto-download of ktfmt 0.62 from Maven Central with SHA-256 verification.
- Configurable style (`meta`, `google`, `kotlinlang`).
- `ktfmt.javaHome` setting with `JAVA_HOME` / `PATH` fallback.
- `ktfmt.jarPath` override.
- `ktfmt.removeUnusedImports` and `ktfmt.enableEditorConfig` settings.
- Commands: `ktfmt.format`, `ktfmt.downloadJar`, `ktfmt.showJarPath`.
