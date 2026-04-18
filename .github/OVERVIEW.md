# ALCops Azure DevOps Extension

## What Is This?

An Azure DevOps extension that provides pipeline tasks for downloading and installing [ALCops](https://alcops.dev) code analyzers for AL (Business Central). The main challenge it solves: **automatically detecting the correct .NET target framework (TFM)** to match your AL compiler version.

## Tasks

| Task | Purpose | Key Input |
|------|---------|-----------|
| **ALCopsInstallAnalyzers** | Downloads ALCops from NuGet, extracts correct analyzer DLLs | `tfm` or `compilerPath` |
| **ALCopsDetectTfmFromBCArtifact** | Detects TFM from a BC artifact URL | `artifactUrl` |
| **ALCopsDetectTfmFromNuGetDevTools** | Detects TFM from NuGet DevTools package version | `version` |
| **ALCopsDetectTfmFromMarketplace** | Detects TFM from the VS Marketplace AL Language extension | `channel` |

Detection tasks output a `tfm` variable that feeds into `ALCopsInstallAnalyzers`.

## Quick Start

**Simplest** — you know your TFM:
```yaml
steps:
  - task: ALCopsInstallAnalyzers@1
    inputs:
      tfm: net8.0
```

**Auto-detect** — from your AL compiler directory:
```yaml
steps:
  - task: ALCopsInstallAnalyzers@1
    inputs:
      compilerPath: $(alcCompilerDir)
```

**Chain detection** — from a BC artifact URL:
```yaml
steps:
  - task: ALCopsDetectTfmFromBCArtifact@1
    name: detectTfm
    inputs:
      artifactUrl: $(bcArtifactUrl)

  - task: ALCopsInstallAnalyzers@1
    inputs:
      tfm: $(detectTfm.tfm)
```

## How It Works

### The TFM Problem

ALCops publishes analyzer DLLs for multiple .NET target frameworks inside the NuGet package:

```
lib/
├── net8.0/           ← For AL Language v16.0+ (BC 2024+)
│   ├── ALCops.Analyzers.dll
│   └── ...
└── netstandard2.1/   ← For AL Language ≤ v15.x (older BC)
    ├── ALCops.Analyzers.dll
    └── ...
```

Using the wrong TFM causes runtime errors. This extension auto-detects which one you need.

### Detection Methods

**Compiler path** — Reads the `Microsoft.Dynamics.Nav.CodeAnalysis.dll` from your AL compiler directory and binary-searches the DLL for the embedded `TargetFrameworkAttribute` to determine the TFM.

**BC Artifact** — BC artifact URLs point to large ZIP files (~2GB). The task uses a **3-step waterfall**:

1. **manifest.json** — Uses HTTP Range requests to read only `manifest.json` (~200KB traffic). If the `dotNetVersion` field exists (e.g., `"8.0.24"`), it maps directly to `net8.0`. Modern BC versions include this field.
2. **"core" artifact** — For older artifacts without `dotNetVersion`, the task constructs a "core" variant URL (replaces the country segment with `core`). This small ZIP contains just the ALLanguage.vsix. The task downloads it, extracts the CodeAnalysis DLL from the VSIX, and PE-parses the assembly version to determine the TFM.
3. **"platform" artifact** — If no "core" artifact exists (very old versions), the task falls back to the platform artifact. It uses HTTP Range requests to extract only the ALLanguage.vsix from the ~800MB platform ZIP, then PE-parses the DLL. The `platformUrl` from `manifest.json` is used when available.

All three steps are pure TypeScript with no external dependencies like BcContainerHelper.

**NuGet DevTools** — Queries the NuGet API for `Microsoft.Dynamics.BusinessCentral.Development.Tools` package versions, then extracts the CodeAnalysis DLL via HTTP Range requests and binary-searches it for the TFM.

**VS Marketplace** — Queries the Visual Studio Marketplace API for the AL Language extension (`ms-dynamics-smb.al`). Extracts the ALLanguage.vsix via HTTP Range, then uses the shared VSIX-TFM detection chain (PE-parses `CodeAnalysis.dll` for the AssemblyVersion) to map to TFM.

### Version Threshold

```
AssemblyVersion ≤ 16.0.21.53261  →  netstandard2.1
AssemblyVersion > 16.0.21.53261  →  net8.0
```

Source: [Discussion #144](https://github.com/ALCops/Analyzers/discussions/144)

## Development

```bash
npm install           # Install dependencies
npm test              # Run 129 tests (vitest)
npm run build         # TypeScript check
npm run bundle        # esbuild → 4 task bundles
npm run package       # Bundle + tfx → production .vsix
npm run package:dev   # Bundle + tfx → dev/test .vsix
```

### Versioning & CI/CD

Version numbers are managed by [GitVersion](https://gitversion.net/) (GitHubFlow/v1):

```
Tag v0.1.0  →  version 0.1.0   (production release)
Next commit →  version 0.1.1   (dev extension, auto-published)
Next commit →  version 0.1.2
Tag v0.2.0  →  version 0.2.0   (production release)
```

Two extensions are published:
- **Dev** (`alcops-ado-dev`) — private, auto-published on every push to `main`
- **Production** (`alcops-ado`) — published on `v*` tags

See [CONTRIBUTING.md](../CONTRIBUTING.md) for testing in Azure DevOps setup.

### Tech Stack

- **TypeScript** + **esbuild** — each task bundles to a single file (250-430KB)
- **vitest** — test runner with built-in mocking (zero config)
- **fflate** — ZIP compression/decompression (pure JS)
- **fflate** — ZIP handling (pure JS, cross-platform)
- **azure-pipelines-task-lib** — Azure DevOps task SDK
- **Node 24** primary + **Node 20** fallback execution handlers

### Architecture

See [ARCHITECTURE.md](.github/ARCHITECTURE.md) for the full technical deep-dive.

### Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the development workflow, testing strategy, and code review checklist.

## Links

- 🌐 [ALCops Website](https://alcops.dev)
- 📦 [NuGet Package](https://www.nuget.org/packages/ALCops.Analyzers)
- 💬 [GitHub Discussions](https://github.com/ALCops/Analyzers/discussions)
- 🐛 [Issues](https://github.com/ALCops/Analyzers/issues)
- 📖 [Discussion #144 — Azure DevOps Extension](https://github.com/ALCops/Analyzers/discussions/144)
