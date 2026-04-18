# ALCops for Azure DevOps

Azure DevOps pipeline tasks for downloading and installing [ALCops](https://alcops.dev) code analyzers for AL (Business Central). The extension provides 4 tasks that handle analyzer installation and automatic target framework (TFM) detection from multiple sources.

## Tasks

| Task | Description |
|------|-------------|
| **ALCopsInstallAnalyzers** | Download and install ALCops analyzer DLLs from NuGet or a local package |
| **ALCopsDetectTfmFromBCArtifact** | Detect the TFM from a Business Central artifact URL |
| **ALCopsDetectTfmFromNuGetDevTools** | Detect the TFM from the BC Development Tools NuGet package |
| **ALCopsDetectTfmFromMarketplace** | Detect the TFM from the AL Language extension on the VS Marketplace |

## Quick Start

The simplest usage — specify the TFM manually:

```yaml
steps:
  - task: ALCopsInstallAnalyzers@0
    inputs:
      version: "latest"
      tfm: "net8.0"
```

## Usage Examples

### Manual TFM

```yaml
steps:
  - task: ALCopsInstallAnalyzers@0
    inputs:
      tfm: "net8.0"  # or "netstandard2.1" for older BC versions
```

### Auto-detect from Compiler Path

If BC DevTools are already installed, point to the compiler directory for automatic detection:

```yaml
steps:
  - task: ALCopsInstallAnalyzers@0
    inputs:
      compilerPath: "$(Agent.ToolsDirectory)/bc-devtools/bin"
```

### Detect from BC Artifact → Install

Use HTTP Range requests to read `manifest.json` from a remote BC artifact (~100KB bandwidth), then install the matching analyzers:

```yaml
steps:
  - task: ALCopsDetectTfmFromBCArtifact@0
    name: detectTfm
    inputs:
      artifactUrl: "$(bcArtifactUrl)"

  - task: ALCopsInstallAnalyzers@0
    inputs:
      tfm: "$(detectTfm.tfm)"
```

### Detect from NuGet DevTools → Install

For pipelines using `Microsoft.Dynamics.BusinessCentral.Development.Tools` from NuGet:

```yaml
steps:
  - task: ALCopsDetectTfmFromNuGetDevTools@0
    name: detectTfm
    inputs:
      version: "latest"

  - task: ALCopsInstallAnalyzers@0
    inputs:
      tfm: "$(detectTfm.tfm)"
```

### Detect from VS Marketplace → Install

Detect the TFM from the AL Language VS Code extension:

```yaml
steps:
  - task: ALCopsDetectTfmFromMarketplace@0
    name: detectTfm
    inputs:
      channel: "current"

  - task: ALCopsInstallAnalyzers@0
    inputs:
      tfm: "$(detectTfm.tfm)"
```

### Air-Gapped / Offline Environments

For environments without internet access, download the `.nupkg` file ahead of time:

```yaml
steps:
  - task: ALCopsInstallAnalyzers@0
    inputs:
      packageSource: "local"
      localPackagePath: "$(Build.SourcesDirectory)/tools/ALCops.Analyzers.1.0.0.nupkg"
      tfm: "net8.0"
```

### Using Outputs

```yaml
steps:
  - task: ALCopsInstallAnalyzers@0
    name: alcops
    inputs:
      tfm: "net8.0"

  - script: echo "Installed $(alcops.alcopsVersion) with TFM $(alcops.tfm)"

  - script: |
      alc.exe /project:"$(Build.SourcesDirectory)" \
        /analyzer:"$(alcops.analyzers)"
```

## Task Reference

### ALCopsInstallAnalyzers

Download and install ALCops code analyzers for AL (Business Central).

#### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `version` | `latest` | ALCops version: `latest`, `prerelease`, or specific (e.g., `1.2.3`) |
| `packageSource` | `nuget` | `nuget` (download from nuget.org) or `local` (use local `.nupkg`) |
| `localPackagePath` | — | Path to local `.nupkg` file (when `packageSource: local`) |
| `tfm` | — | Target framework: `net8.0`, `netstandard2.1`, `net10.0`. Leave empty + provide `compilerPath` for auto-detection |
| `compilerPath` | — | Path to directory containing `Microsoft.Dynamics.Nav.CodeAnalysis.dll` (for auto-detection) |
| `outputPath` | `$(Build.SourcesDirectory)/.alcops` | Where to place extracted analyzer DLLs |

#### Outputs

| Variable | Description |
|----------|-------------|
| `alcopsVersion` | Installed ALCops version |
| `tfm` | Detected or specified target framework moniker |
| `analyzerPath` | Full path to extracted analyzer DLLs directory |
| `analyzers` | Semicolon-separated list of analyzer DLL paths |

---

### ALCopsDetectTfmFromBCArtifact

Detect the target framework moniker from a Business Central artifact URL by reading its manifest.

#### Inputs

| Input | Default | Required | Description |
|-------|---------|----------|-------------|
| `artifactUrl` | — | Yes | BC artifact URL (e.g., from `Get-BCArtifactUrl`) |

#### Outputs

| Variable | Description |
|----------|-------------|
| `tfm` | Detected target framework moniker (e.g., `net8.0`, `netstandard2.1`) |
| `dotNetVersion` | .NET version string from the artifact manifest (e.g., `8.0.24`) |

---

### ALCopsDetectTfmFromNuGetDevTools

Detect the target framework moniker from the `Microsoft.Dynamics.BusinessCentral.Development.Tools` NuGet package version.

#### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `version` | `latest` | DevTools version: `latest`, `prerelease`, or specific (e.g., `26.0.12345.0`) |

#### Outputs

| Variable | Description |
|----------|-------------|
| `tfm` | Detected target framework moniker (e.g., `net8.0`, `netstandard2.1`) |
| `devToolsVersion` | Resolved DevTools package version |

---

### ALCopsDetectTfmFromMarketplace

Detect the target framework moniker from the AL Language VS Code extension on the Visual Studio Marketplace.

#### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `channel` | `current` | Extension channel: `current` (latest stable) or `prerelease` |
| `extensionVersion` | — | Pin to a specific AL Language extension version (overrides `channel`) |

#### Outputs

| Variable | Description |
|----------|-------------|
| `tfm` | Detected target framework moniker (e.g., `net8.0`, `netstandard2.1`) |
| `extensionVersion` | Resolved AL Language extension version |
| `assemblyVersion` | Assembly version of the CodeAnalysis DLL |

## Development

### Prerequisites

- Node.js ≥ 20
- npm

### Commands

```bash
cd azure-devops-extension
npm install                # Install dependencies
npm run lint               # Lint (eslint shared/ tasks/*/src/)
npm test                   # Run tests (105 tests across 13 files)
npm run build              # TypeScript compilation (tsc -p tsconfig.json)
npm run bundle             # esbuild bundling (4 task bundles)
npm run package            # Bundle + create .vsix extension package
```

## Architecture

The extension contains **4 tasks**, each with its own entry point under `tasks/`:

```
tasks/
  install-analyzers/          # ALCopsInstallAnalyzers — downloads and extracts analyzer DLLs
  detect-tfm-bc-artifact/  # ALCopsDetectTfmFromBCArtifact — reads manifest from remote BC artifact
  detect-tfm-nuget-devtools/ # ALCopsDetectTfmFromNuGetDevTools — resolves version from NuGet
  detect-tfm-marketplace/  # ALCopsDetectTfmFromMarketplace — queries VS Marketplace API
shared/                    # Shared modules (binary-tfm, http-range, types)
```

Each task is bundled into a single file via **esbuild** (`tasks/{name}/dist/index.js`), including all dependencies. The shared modules provide binary TFM detection from .NET assemblies, HTTP Range request utilities, and shared type definitions.

## Links

- [ALCops Website](https://alcops.dev)
- [GitHub Repository](https://github.com/ALCops/Analyzers)
- [Report Issues](https://github.com/ALCops/Analyzers/issues)
- [Discussions](https://github.com/ALCops/Analyzers/discussions)
