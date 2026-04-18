# Architecture — ALCops Azure DevOps Extension

## Overview

The ALCops Azure DevOps Extension provides pipeline tasks for downloading and installing [ALCops code analyzers](https://alcops.dev) for AL (Business Central). The extension solves one key problem: **matching the correct analyzer DLLs to the consumer's AL compiler version** via Target Framework Moniker (TFM) detection.

## Task Architecture

The extension is split into **4 independent tasks** packaged in a single `.vsix`:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Single .vsix Extension                       │
│                                                                     │
│  ┌────────────────────┐  ┌────────────────────┐                     │
│  │  DetectTfmFrom      │  │  DetectTfmFrom      │                   │
│  │  BCArtifact         │  │  NuGetDevTools       │  Detection tasks  │
│  │  (261 KB)           │  │  (250 KB)            │  output: tfm      │
│  └────────┬───────────┘  └────────┬─────────────┘                   │
│           │                       │                                  │
│  ┌────────┴───────────┐          │                                  │
│  │  DetectTfmFrom      │          │                                  │
│  │  Marketplace        │          │                                  │
│  │  (431 KB)           │          │                                  │
│  └────────┬───────────┘          │                                  │
│           │      ┌───────────────┘                                  │
│           ▼      ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              ALCopsInstallAnalyzers                   │           │
│  │              (431 KB)                                 │  Core     │
│  │                                                       │  task    │
│  │  Inputs: tfm (manual) | compilerPath (auto-detect)    │          │
│  │  Output: analyzerPath, analyzers, tfm, alcopsVersion  │          │
│  └───────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Separate Tasks?

A single task with 5+ TFM detection modes was confusing. Separate tasks:

1. **Composable** — consumers chain only what they need in their pipeline YAML
2. **Single responsibility** — each task does one thing well
3. **Discoverable** — clear names in the Azure DevOps task picker
4. **Independently versionable** — a fix to marketplace detection doesn't require re-testing the core installer

## Directory Structure

```
azure-devops-extension/
├── shared/                              ← Shared TypeScript modules
│   ├── types.ts                         Constants, types, interfaces
│   ├── version-threshold.ts             .NET runtime version → TFM mapping
│   ├── http-range.ts                    HTTP Range requests + remote ZIP parsing
│   ├── zip-local.ts                     In-memory ZIP extraction from Buffer
│   ├── binary-tfm.ts                    Binary search for TFM + assembly version in DLL
│   ├── vsix-tfm.ts                      VSIX → DLL → binary search → TFM (shared chain)
│   └── bc-artifact-url.ts               BC artifact URL parsing + variant construction
│
├── tasks/
│   ├── install-analyzers/                  ← Core install task
│   │   ├── task.json                    Azure DevOps task definition
│   │   ├── src/
│   │   │   ├── index.ts                 Entry point (calls task-runner)
│   │   │   ├── task-runner.ts           Orchestrator: TFM → download → extract → outputs
│   │   │   ├── nuget-api.ts             NuGet version resolution + download
│   │   │   ├── nuget-extractor.ts       ZIP extraction with TFM folder selection
│   │   │   └── compiler-path.ts         PE parsing for auto-detect from ALC.exe
│   │   └── dist/index.js               esbuild bundle output
│   │
│   ├── detect-tfm-bc-artifact/          ← BC Artifact detection task
│   │   ├── task.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── task-runner.ts
│   │   │   └── bc-artifact.ts           3-step waterfall: manifest → core → platform
│   │   └── dist/index.js
│   │
│   ├── detect-tfm-nuget-devtools/       ← NuGet DevTools detection task
│   │   ├── task.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── task-runner.ts
│   │   │   └── nuget-devtools.ts        NuGet API → HTTP Range + binary search → TFM
│   │   └── dist/index.js
│   │
│   └── detect-tfm-marketplace/          ← VS Marketplace detection task
│       ├── task.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── task-runner.ts
│       │   └── marketplace.ts           Marketplace API → VSIX → shared vsix-tfm → TFM
│       └── dist/index.js
│
├── tests/                               ← All tests (mirrors task structure)
│   ├── scaffold.test.ts                 Structural smoke tests
│   ├── shared/
│   ├── install-analyzers/
│   ├── detect-tfm-bc-artifact/
│   ├── detect-tfm-nuget-devtools/
│   ├── detect-tfm-marketplace/
│   └── fixtures/                        Generated .NET stub DLLs
│       ├── compiler-net80/              AssemblyVersion 17.0.0.0
│       └── compiler-netstandard21/      AssemblyVersion 15.0.0.0
│
├── images/
│   └── icon.png                         Extension icon (128×128)
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                       PR tests + dev extension publish on main
│   │   └── release.yml                  Production publish on v* tags
│   ├── ARCHITECTURE.md                  This file
│   ├── copilot-instructions.md          AI agent instructions (Copilot)
│   ├── copilot-setup-steps.yml          AI agent environment setup
│   └── OVERVIEW.md                      High-level overview
│
├── package.json                         Dependencies + scripts
├── tsconfig.json                        TypeScript config (shared + all tasks)
├── esbuild.config.mjs                   Multi-entry bundler (4 tasks)
├── vitest.config.ts                     Test runner config
├── GitVersion.yml                       GitVersion config (GitHubFlow/v1)
├── vss-extension.json                   Production Marketplace manifest
├── vss-extension.dev.json               Dev/test Marketplace manifest
├── overview.md                          Marketplace listing description
├── CONTRIBUTING.md                      Development guide
└── README.md                            User-facing documentation
```

## Shared Modules

Code in `shared/` is imported by task source files and **bundled into each task** by esbuild. There are no runtime shared dependencies — each task's `dist/index.js` is a self-contained bundle.

### types.ts

Constants and interfaces used across all tasks:

| Export | Value | Used By |
|--------|-------|---------|
| `AL_COMPILER_DLL` | `'Microsoft.Dynamics.Nav.CodeAnalysis.dll'` | compiler-path |
| `NUGET_PACKAGE_NAME` | `'ALCops.Analyzers'` | nuget-api |
| `NUGET_FLAT_CONTAINER` | `'https://api.nuget.org/v3-flatcontainer'` | nuget-api, nuget-devtools |
| `VS_MARKETPLACE_API` | VS Marketplace gallery endpoint | marketplace |
| `AL_EXTENSION_ID` | `'ms-dynamics-smb.al'` | marketplace |
| `VSIX_DLL_PATH` | `'extension/bin/Analyzers/...'` | vsix-tfm |
| `TFM_PREFERENCE` | `['net10.0', ..., 'netstandard2.0']` | nuget-extractor, nuget-devtools |
| `TfmDetectionResult` | Interface: `{ tfm, source, details? }` | All detection modules |

### binary-tfm.ts

Binary search for TFM and assembly version directly from .NET assembly DLL buffers using `Buffer.indexOf()`. No PE parsing required.

- `detectTfmFromBuffer(buffer)` — Searches for `TargetFrameworkAttribute` then extracts the TFM string (e.g., `.NETCoreApp,Version=v8.0` → `net8.0`)
- `detectAssemblyVersionFromBuffer(buffer)` — Searches for `AssemblyFileVersionAttribute` then extracts the version using blob format validation (`\x01\x00` prolog + length byte + version string)
- `toShortTfm(longTfm)` — Converts long-form TFM to short form (e.g., `.NETCoreApp,Version=v8.0` → `net8.0`)

### version-threshold.ts

Pure logic — no I/O, no dependencies beyond `types.ts`.

- `getTargetFrameworkFromDotNetVersion(dotNetVersion)` — Maps .NET runtime version (e.g., `"8.0.24"`) to TFM

### http-range.ts

HTTP Range request utilities for reading specific bytes from remote ZIP files without downloading the entire file. This is critical for BC artifacts (~2GB) and VSIX files (~100MB).

```
Full file:  [========================================] 2 GB
Downloaded: [..EOCD] + [..central-dir..] + [..file..]  ~200 KB
```

Key functions:
- `fetchRange(url, start, end)` — GET with `Range: bytes=start-end` header, follows redirects
- `getContentLength(url)` — HEAD request to get file size
- `readZipEOCD(url)` — Reads End of Central Directory from last ~65KB
- `parseZipCentralDirectory(buffer)` — Parses central directory entries from raw bytes
- `extractRemoteZipEntry(url, entryPath)` — End-to-end: find entry → read local header → decompress

### zip-local.ts

In-memory ZIP extraction for processing nested ZIPs (e.g., extracting a DLL from a VSIX that was itself extracted from a BC artifact). Complements `http-range.ts` which works with remote URLs.

Key functions:
- `extractZipEntryFromBuffer(zipBuffer, entryPath)` — Extract a single file from an in-memory ZIP buffer. Supports exact path match and basename match (e.g., `'ALLanguage.vsix'` finds `'path/to/ALLanguage.vsix'`)
- `findEntryByFilename(entries, target)` — Scan central directory entries for a filename match
- `extractRemoteZipCentralEntry(url, entry)` — Extract a specific central directory entry from a remote ZIP
- `listZipEntries(zipBuffer)` — List all entries in a ZIP buffer

Reuses `parseZipCentralDirectory` from `http-range.ts` for the central directory parsing.

### vsix-tfm.ts

Shared VSIX → DLL → TFM detection chain. Extracts the CodeAnalysis DLL from an ALLanguage.vsix buffer, binary-searches it for the TFM and assembly version. Used by both the **marketplace** and **bc-artifact** tasks.

- `detectTfmFromVsixBuffer(vsixBuffer)` → `{ tfm, assemblyVersion }`
  1. Extracts `VSIX_DLL_PATH` from the VSIX using `extractZipEntryFromBuffer`
  2. Binary-searches the DLL for `TargetFrameworkAttribute` and `AssemblyFileVersionAttribute`

### bc-artifact-url.ts

BC artifact URL parsing and variant URL construction. Follows the same URL splitting convention as [navcontainerhelper](https://github.com/microsoft/navcontainerhelper) (`parts[3]=type, parts[4]=version, parts[5]=country`).

- `parseArtifactUrl(artifactUrl)` → `{ baseUrl, type, version, country, query }`
- `buildArtifactVariantUrl(artifactUrl, variant)` — Replaces the country segment (e.g., `w1` → `core` or `platform`)
- `downloadFullZip(url)` — Full GET download into a Buffer (for small artifacts like "core")

## TFM Detection Flow

The core problem: ALCops ships DLLs for multiple .NET target frameworks (`netstandard2.1`, `net8.0`, `net10.0`). The correct one depends on the consumer's AL compiler version.

### Detection Strategies

| Strategy | How It Works | When to Use |
|----------|-------------|-------------|
| **Manual** | Consumer specifies `tfm: net8.0` directly | You know your target |
| **Compiler path** | PE-parse `Microsoft.Dynamics.Nav.CodeAnalysis.dll` from the AL compiler directory | ALC.exe is already on disk |
| **BC Artifact** | 3-step waterfall: (A) `manifest.json` → `dotNetVersion`, (B) "core" artifact → VSIX → PE parse, (C) "platform" artifact via HTTP Range → VSIX → PE parse | Using BC artifacts in pipeline |
| **NuGet DevTools** | Query NuGet for `Microsoft.Dynamics.BusinessCentral.Development.Tools` version → threshold | Using NuGet DevTools in pipeline |
| **VS Marketplace** | Query Marketplace API → HTTP Range extract VSIX → shared VSIX-TFM chain → PE parse | Using AL Language extension version |

### Version Threshold Logic

```
Assembly Version ≤ 16.0.21.53261  →  netstandard2.1  (AL Language ≤ v15.x)
Assembly Version > 16.0.21.53261  →  net8.0           (AL Language v16.0+)
```

For `.NET runtime version` (from BC artifact manifests):
```
Major ≥ 8   →  net{major}.0  (e.g., 8.0.24 → net8.0, 10.0.0 → net10.0)
Major < 8   →  netstandard2.1
```

## Build Pipeline

```
TypeScript Sources          esbuild (4 parallel)        tfx-cli
    shared/*.ts     ─┐
    tasks/A/src/*.ts ─┤──→  tasks/A/dist/index.js  ──┐
    tasks/B/src/*.ts ─┤──→  tasks/B/dist/index.js  ──┤──→  .vsix
    tasks/C/src/*.ts ─┤──→  tasks/C/dist/index.js  ──┤
    tasks/D/src/*.ts ─┘──→  tasks/D/dist/index.js  ──┘
```

- **esbuild** bundles each task into a single CJS file targeting Node 24
- Shared modules are tree-shaken into each bundle (no runtime shared dependency)
- `tfx extension create` packages all 4 task directories + metadata into a single `.vsix`

## CI/CD & Versioning

### GitVersion (GitHubFlow/v1)

Version numbers are managed by [GitVersion](https://gitversion.net/) with `ContinuousDeployment` mode and no pre-release labels. This produces clean `Major.Minor.Patch` versions — the same everywhere (GitHub, ADO Marketplace).

```
Tag v0.1.0  →  0.1.0
Next commit →  0.1.1  (auto-increment Patch)
Next commit →  0.1.2
Tag v0.2.0  →  0.2.0
```

### Two Extension IDs

The extension uses Microsoft's recommended two-manifest pattern:

| Manifest | Extension ID | Published When | Visibility |
|----------|-------------|----------------|------------|
| `vss-extension.dev.json` | `alcops-ado-dev` | Push to `main` | Private (shared with test org) |
| `vss-extension.json` | `alcops-ado` | Tag `v*` | Public (production) |

### Version Stamping

Task versions are stamped inline in the workflow YAML using `jq`:

```yaml
for f in tasks/*/task.json; do
  jq --indent 4 \
    '.version.Minor = <minor> | .version.Patch = <patch>' \
    "$f" > tmp.$$ && mv tmp.$$ "$f"
done
```

GitVersion provides `minor` and `patch` as separate outputs. Task `Major` is preserved (only bumped for breaking YAML contract changes). Consumers reference tasks as `TaskName@1`.

### CI Pipeline Flow

```
PR / Feature Branch          Push to main              Tag v*
==================          =============             ========
[test + build]              [test + build]            [test + build]
                            [gitversion]              [gitversion]
                            [jq stamp tasks]          [jq stamp tasks]
                            [tfx publish DEV]         [tfx publish PROD]
                                                      [github release]
```

### Required GitHub Configuration

| Name | Type | Purpose |
|------|------|---------|
| `VISUAL_STUDIO_MARKETPLACE_PAT` | Secret | PAT with **Marketplace (publish)** scope |

## Runtime Execution

On the Azure DevOps agent:

1. Agent picks the best available Node handler: `Node24_1` → `Node20_1` (fallback)
2. Agent runs `tasks/<task>/dist/index.js`
3. `index.ts` calls `task-runner.ts` → `run()`
4. Task-runner reads inputs via `tl.getInput()`, executes logic, sets outputs via `tl.setVariable()`
5. Output variables (prefixed by task `name` attribute) are available to downstream tasks

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `azure-pipelines-task-lib` | ^5.2.8 | Azure DevOps task SDK (inputs, outputs, logging) |
| `fflate` | ^0.8.2 | ZIP compression/decompression (pure JS) |
| `semver` | ^7.7.4 | Semantic version comparison |

Dev dependencies: TypeScript, esbuild, vitest, eslint, tfx-cli.

## Testing Strategy

- **vitest** as test runner with built-in mocking (`vi.mock`, `vi.mocked`)
- **No real network calls** — all HTTP mocked at module level
- **Real ZIP fixtures** — created in-memory using `fflate.zipSync()`
- **Real PE fixtures** — minimal .NET assemblies generated via `dotnet build` (3.5KB each, contain embedded TFM and assembly version attributes)
- **Module isolation** — each test file mocks its external dependencies

### Test Organization

| Test File | Module | Tests |
|-----------|--------|-------|
| `scaffold.test.ts` | Structure verification | 14 |
| `shared/version-threshold.test.ts` | .NET runtime version → TFM mapping | 6 |
| `shared/binary-tfm.test.ts` | Binary TFM + assembly version extraction | 17 |
| `shared/http-range.test.ts` | HTTP Range + ZIP parsing | 21 |
| `shared/zip-local.test.ts` | In-memory ZIP extraction | 11 |
| `shared/vsix-tfm.test.ts` | VSIX → DLL → binary search → TFM chain | 5 |
| `shared/bc-artifact-url.test.ts` | Artifact URL parsing + variant construction | 7 |
| `install-analyzers/nuget-api.test.ts` | NuGet API client | 9 |
| `install-analyzers/nuget-extractor.test.ts` | ZIP extraction + TFM compat matching | 17 |
| `install-analyzers/compiler-path.test.ts` | Binary TFM detection from real fixture DLLs | 15 |
| `install-analyzers/task-runner.test.ts` | Core task orchestration | 4 |
| `detect-tfm-bc-artifact/*.test.ts` | BC Artifact 3-step waterfall + task-runner | 16 |
| `detect-tfm-nuget-devtools/*.test.ts` | NuGet DevTools HTTP Range detection + task-runner | 14 |
| `detect-tfm-marketplace/*.test.ts` | Marketplace detection + task-runner | 17 |
| `shared/log-inputs.test.ts` | Task input logging | 9 |
| **Total** | | **182** |
