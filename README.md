# ALCops for Azure DevOps

Azure DevOps pipeline task for downloading [ALCops](https://alcops.dev) code analyzers for AL Language of Microsoft Dynamics 365 Business Central.

## Quick Start

```yaml
steps:
  - task: ALCopsDownloadAnalyzers@1
    displayName: ALCops - Download Analyzers
    inputs:
      tfm: "net8.0" # Or use the detectUsing parameter instead of static value
      outputPath: "$(Build.SourcesDirectory)/.alcops"
```

## Usage Examples

### Auto-detect from BC Artifact URL

Pass a BC artifact URL and the TFM is detected automatically:

```yaml
steps:
  - task: ALCopsDownloadAnalyzers@1
    displayName: ALCops - Download Analyzers
    inputs:
      detectUsing: "$(bcArtifactUrl)"
```

### Auto-detect from NuGet DevTools version

```yaml
steps:
  - task: ALCopsDownloadAnalyzers@1
    name: alcops
    inputs:
      detectUsing: "latest" # Latest or preview for beta/prelease releases
      detectFrom: "nuget-devtools" # Optional: Defaults to BC DevTools from NuGet, set to 'marketplace' for AL Language extension from VS Code Marketplace
```

### Auto-detect from VS Marketplace version

Force a specific detection source with `detectFrom`:

```yaml
steps:
  - task: ALCopsDownloadAnalyzers@1
    name: alcops
    inputs:
      detectUsing: "current"
      detectFrom: "marketplace"
```

### Auto-detect from Compiler Path

```yaml
steps:
  - task: ALCopsDownloadAnalyzers@1
    name: alcops
    inputs:
      detectUsing: "$(Agent.ToolsDirectory)/bc-devtools/bin"
```

### Specific ALCops version

```yaml
steps:
  - task: ALCopsDownloadAnalyzers@1
    name: alcops
    inputs:
      tfm: "net8.0"
      version: "1.2.3"
```

### Using Outputs

```yaml
steps:
  - task: ALCopsDownloadAnalyzers@1
    name: alcops
    inputs:
      detectUsing: "latest"

  - script: echo "Downloaded $(alcops.version) with TFM $(alcops.tfm)"

  - script: |
      alc.exe /project:"$(Build.SourcesDirectory)" \
        /analyzer:"$(alcops.files)"
```

## Task Reference

### ALCopsDownloadAnalyzers

Download ALCops code analyzers with automatic TFM detection.

#### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `detectUsing` | — | Input for TFM detection: BC artifact URL, local compiler path, NuGet DevTools version/channel, or VS Marketplace version. Smart routing determines the source. |
| `detectFrom` | *(auto)* | Force a detection source: `bc-artifact`, `marketplace`, `nuget-devtools`, `compiler-path` |
| `tfm` | — | Explicit target framework: `net8.0`, `netstandard2.1`, `net10.0`. Skips detection. |
| `version` | `latest` | ALCops version: `latest`, `preview`, or specific (e.g., `1.2.3`) |
| `outputPath` | `$(Build.SourcesDirectory)/.alcops` | Where to place extracted analyzer DLLs |

> **Note:** Either `detectUsing` or `tfm` must be provided.

#### Outputs

| Variable | Description |
|----------|-------------|
| `version` | Downloaded ALCops version |
| `tfm` | Detected or specified target framework moniker |
| `outputDir` | Full path to extracted analyzer DLLs directory |
| `files` | Semicolon-separated list of analyzer DLL paths |

## Development

### Prerequisites

- Node.js >= 20
- npm

### Commands

```bash
cd azure-devops-extension
npm ci                     # Install dependencies
npm run lint               # Lint (eslint shared/ tasks/*/src/)
npm test                   # Run tests (vitest)
npm run build              # TypeScript compilation (tsc -p tsconfig.json)
npm run bundle             # esbuild bundling (5 task bundles)
npm run package            # Bundle + create .vsix extension package
```

## Architecture

The extension contains **5 tasks** under `tasks/`. Only `ALCopsDownloadAnalyzers` is actively maintained; the legacy tasks remain for backward compatibility.

```
tasks/
  download/                   # ALCopsDownloadAnalyzers — single-step detect + download
  install-analyzers/          # ALCopsInstallAnalyzers — deprecated
  detect-tfm-bc-artifact/     # ALCopsDetectTfmFromBCArtifact — deprecated
  detect-tfm-nuget-devtools/  # ALCopsDetectTfmFromNuGetDevTools — deprecated
  detect-tfm-marketplace/     # ALCopsDetectTfmFromMarketplace — deprecated
shared/                       # Shared modules (logger, input logging)
```

Each task is bundled into a single file via **esbuild** (`tasks/{name}/dist/index.js`), including all dependencies. All core logic lives in the [`@alcops/core`](https://www.npmjs.com/package/@alcops/core) package.

## Links

- [ALCops Website](https://alcops.dev)
- [GitHub Repository](https://github.com/ALCops/Analyzers)
- [Report Issues](https://github.com/ALCops/Analyzers/issues)
- [Discussions](https://github.com/ALCops/Analyzers/discussions)
