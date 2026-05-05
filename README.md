# vscode-ktfmt

Format Kotlin code in Visual Studio Code with [ktfmt](https://github.com/facebook/ktfmt) (currently bundled version: **0.62**).

## Features

- Document formatting provider for `.kt` and `.kts` files (works with **Format Document** and `editor.formatOnSave`).
- Explicit `Kotlin: Format with ktfmt` command.
- Automatically downloads the supported ktfmt fat JAR on first use, with SHA-256 verification.
- Configurable formatting style: `meta`, `google`, `kotlinlang` (default).
- Override hooks for both the Java installation (`ktfmt.javaHome`) and the ktfmt JAR (`ktfmt.jarPath`).

## Requirements

- A Java Development Kit (JDK 11+ recommended) reachable via one of:
  1. `ktfmt.javaHome` setting
  2. `JAVA_HOME` environment variable (works out of the box with [SDKMAN!](https://sdkman.io/))
  3. `java` on `PATH`

## Installation

Install from the Visual Studio Code Marketplace (publisher: `ombratteng`).

## Usage

Open any `.kt` or `.kts` file and:

- Run **Format Document** (default `Shift+Alt+F`), or
- Run the **Kotlin: Format with ktfmt** command from the Command Palette, or
- Enable `editor.formatOnSave` and set the default formatter:

  ```jsonc
  {
    "[kotlin]": {
      "editor.defaultFormatter": "ombratteng.ktfmt",
      "editor.formatOnSave": true
    },
    "[kotlin-script]": {
      "editor.defaultFormatter": "ombratteng.ktfmt",
      "editor.formatOnSave": true
    }
  }
  ```

## Settings

| Setting                     | Type                | Default  | Description                                                                                                     |
| --------------------------- | ------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `ktfmt.style`               | enum                | `"meta"` | Formatting style: `meta`, `google`, `kotlinlang`.                                                               |
| `ktfmt.javaHome`            | string              | `""`     | Path to a JDK installation. Falls back to `JAVA_HOME`, then `java` on `PATH`. Supports `~` and `$VAR`/`${VAR}`. |
| `ktfmt.jarPath`             | string              | `""`     | Override path to a ktfmt fat JAR. When set, the bundled version is not downloaded.                              |
| `ktfmt.extraArgs`           | string[]            | `[]`     | Extra arguments passed to ktfmt.                                                                                |
| `ktfmt.maxWidth`            | number \| null      | `null`   | Override the maximum line width (`--max-width`).                                                                |
| `ktfmt.removeUnusedImports` | boolean             | `true`   | Remove unused imports. When `false`, passes `--do-not-remove-unused-imports`.                                   |
| `ktfmt.enableEditorConfig`  | boolean             | `false`  | Pass `--enable-editorconfig` to honor `.editorconfig` overrides for supported options (limited).                |

## Commands

- `Kotlin: Format with ktfmt` (`ktfmt.format`)
- `Kotlin: Download/Update ktfmt JAR` (`ktfmt.downloadJar`)
- `Kotlin: Show ktfmt JAR Path` (`ktfmt.showJarPath`)

## How the JAR is managed

The extension is pinned to a specific ktfmt version (declared in the source as `SUPPORTED_KTFMT_VERSION`). On first format,
the matching `ktfmt-<version>-with-dependencies.jar` is downloaded from Maven Central into VS Code's per-user global storage
and verified against a known SHA-256.

When the extension is updated and the supported version changes, the previously cached JAR no longer matches and a fresh
download is triggered automatically on the next format.

To pin to your own JAR, set `ktfmt.jarPath` — the auto-download is bypassed entirely.

## Development

```sh
pnpm install
pnpm run build         # one-shot build
pnpm run watch         # rebuild on change
pnpm run typecheck     # tsc --noEmit
pnpm run package       # produce a .vsix
```

Open the project in VS Code and press `F5` to launch a new Extension Host with the extension loaded.

## License

BSD 3-Clause. See [LICENSE](./LICENSE).
