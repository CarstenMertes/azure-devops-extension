# Architecture — ALCops Azure DevOps Extension

## Overview

The ALCops Azure DevOps Extension provides a pipeline task for downloading [ALCops code analyzers](https://alcops.dev) for AL (Business Central). The extension solves one key problem: **matching the correct analyzer DLLs to the consumer's AL compiler version** via Target Framework Moniker (TFM) detection.

## Task Architecture

The extension ships **`ALCopsDownloadAnalyzers`** as the primary task, wrapping `@alcops/core`'s `executeDownload()` pipeline. Four legacy tasks remain in the `.vsix` for backward compatibility but are deprecated.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Single .vsix Extension                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              ALCopsDownloadAnalyzers (recommended)              │  │
│  │                                                                │  │
│  │  detectUsing → smart routing → TFM detection → download →     │  │
│  │  extract → output variables                                    │  │
│  │                                                                │  │
│  │  Inputs: detectUsing, detectFrom, tfm, version, outputPath    │  │
│  │  Outputs: version, tfm, outputDir, files                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Legacy tasks (deprecated, kept for backward compatibility)    │  │
│  │                                                                │  │
│  │  ALCopsInstallAnalyzers       → use ALCopsDownloadAnalyzers   │  │
│  │  ALCopsDetectTfmFromBCArtifact     → use detectUsing          │  │
│  │  ALCopsDetectTfmFromNuGetDevTools  → use detectUsing          │  │
│  │  ALCopsDetectTfmFromMarketplace    → use detectUsing          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Why a Single Task?

The previous architecture had 4 separate tasks (3 detection + 1 install) that consumers chained together. The `@alcops/core` package now provides `executeDownload()` which combines detection and download into one call with smart source routing via `detectUsing`. This simplifies pipeline YAML from two steps to one:

```yaml
# Before (deprecated two-step)
- task: ALCopsDetectTfmFromBCArtifact@1
  name: detectTfm
  inputs:
    artifactUrl: "$(bcArtifactUrl)"
- task: ALCopsInstallAnalyzers@1
  inputs:
    tfm: "$(detectTfm.tfm)"

# After (single step)
- task: ALCopsDownloadAnalyzers@1
  name: alcops
  inputs:
    detectUsing: "$(bcArtifactUrl)"
```

## Directory Structure

```
azure-devops-extension/
├── shared/                              ← Shared TypeScript modules
│   ├── logger.ts                        Logger interface + ADO pipeline logger
│   └── log-inputs.ts                    Task input logging helper
│
├── tasks/
│   ├── download/                        ← ALCopsDownloadAnalyzers (recommended)
│   │   ├── task.json                    Azure DevOps task definition
│   │   ├── src/
│   │   │   ├── index.ts                 Entry point (calls task-runner)
│   │   │   └── task-runner.ts           Orchestrator: inputs → executeDownload() → outputs
│   │   └── dist/index.js               esbuild bundle output
│   │
│   ├── install-analyzers/               ← Deprecated: ALCopsInstallAnalyzers
│   │   ├── task.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── task-runner.ts           Legacy orchestrator: TFM → download → extract → outputs
│   │   └── dist/index.js
│   │
│   ├── detect-tfm-bc-artifact/          ← Deprecated: ALCopsDetectTfmFromBCArtifact
│   │   ├── task.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── task-runner.ts
│   │   └── dist/index.js
│   │
│   ├── detect-tfm-nuget-devtools/       ← Deprecated: ALCopsDetectTfmFromNuGetDevTools
│   │   ├── task.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── task-runner.ts
│   │   └── dist/index.js
│   │
│   └── detect-tfm-marketplace/          ← Deprecated: ALCopsDetectTfmFromMarketplace
│       ├── task.json
│       ├── src/
│       │   ├── index.ts
│       │   └── task-runner.ts
│       └── dist/index.js
│
├── tests/                               ← All tests (mirrors task structure)
│   ├── scaffold.test.ts                 Structural smoke tests
│   ├── shared/
│   ├── download/
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
├── esbuild.config.mjs                   Multi-entry bundler (5 tasks)
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

The shared modules provide lightweight ADO-specific utilities:

### logger.ts

Creates a logger that routes to Azure DevOps pipeline commands (`tl.debug`, `tl.warning`, `tl.error`, `console.log`). Implements the `Logger` interface from `@alcops/core`.

### log-inputs.ts

Reads and logs all task inputs defined in `task.json` for pipeline debugging. Automatically masks sensitive values.

### Core Logic (`@alcops/core`)

All TFM detection, NuGet API interaction, HTTP Range requests, binary PE parsing, and ZIP extraction logic lives in the [`@alcops/core`](https://www.npmjs.com/package/@alcops/core) package. The ADO tasks are thin wrappers that read inputs, call `@alcops/core` functions, and set output variables.

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
TypeScript Sources          esbuild (5 parallel)        tfx-cli
    shared/*.ts     ─┐
    tasks/A/src/*.ts ─┤──→  tasks/A/dist/index.js  ──┐
    tasks/B/src/*.ts ─┤──→  tasks/B/dist/index.js  ──┤
    tasks/C/src/*.ts ─┤──→  tasks/C/dist/index.js  ──┤──→  .vsix
    tasks/D/src/*.ts ─┤──→  tasks/D/dist/index.js  ──┤
    tasks/E/src/*.ts ─┘──→  tasks/E/dist/index.js  ──┘
```

- **esbuild** bundles each task into a single CJS file targeting Node 24
- Shared modules are tree-shaken into each bundle (no runtime shared dependency)
- `@alcops/core` is bundled into each task (no external dependency at runtime)
- `tfx extension create` packages all 5 task directories + metadata into a single `.vsix`

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
| `@alcops/core` | ^0.1.1 | Core logic: TFM detection, NuGet API, download, extraction |
| `azure-pipelines-task-lib` | ^5.2.10 | Azure DevOps task SDK (inputs, outputs, logging) |

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
| `scaffold.test.ts` | Structure verification | 16 |
| `shared/log-inputs.test.ts` | Task input logging | 9 |
| `download/task-runner.test.ts` | ALCopsDownloadAnalyzers orchestration | 7 |
| `install-analyzers/task-runner.test.ts` | Legacy install task orchestration | 4 |
| `detect-tfm-bc-artifact/*.test.ts` | Legacy BC Artifact task | 2 |
| `detect-tfm-nuget-devtools/*.test.ts` | Legacy NuGet DevTools task | 3 |
| `detect-tfm-marketplace/*.test.ts` | Legacy Marketplace task | 5 |
