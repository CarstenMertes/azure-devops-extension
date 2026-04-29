# Contributing to the ALCops Azure DevOps Extension

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+ (v24 recommended — Active LTS)
- npm (ships with Node.js)
- [tfx-cli](https://github.com/microsoft/tfs-cli) for packaging (installed as dev dependency)

## Getting Started

```bash
cd azure-devops-extension
npm install
npm test          # Run all tests
npm run build     # TypeScript compilation check
npm run bundle    # esbuild → 5 task bundles
npm run package   # Bundle + tfx → .vsix
```

## Project Structure

See [ARCHITECTURE.md](.github/ARCHITECTURE.md) for the full architecture overview.

```
azure-devops-extension/
├── shared/              Shared modules (bundled into each task)
│   ├── logger.ts            Logger interface + ADO pipeline logger
│   └── log-inputs.ts        Task input logging helper
├── tasks/
│   ├── download/                      ALCopsDownloadAnalyzers (recommended)
│   ├── install-analyzers/             Deprecated — use download instead
│   ├── detect-tfm-bc-artifact/        Deprecated — use download with detectUsing
│   ├── detect-tfm-nuget-devtools/     Deprecated — use download with detectUsing
│   └── detect-tfm-marketplace/        Deprecated — use download with detectUsing
└── tests/                             All tests (mirrors task structure)
```

## Development Workflow

### TDD Approach

All code is developed test-first. Tests live in `tests/` organized by task:

```
tests/
├── shared/                    Shared module tests
├── download/                  ALCopsDownloadAnalyzers task tests
├── install-analyzers/         Deprecated task tests (kept for coverage)
├── detect-tfm-bc-artifact/    Deprecated task tests
├── detect-tfm-nuget-devtools/ Deprecated task tests
├── detect-tfm-marketplace/    Deprecated task tests
└── fixtures/                  Test fixture DLLs
```

Run specific test suites:
```bash
npx vitest run tests/shared/              # Shared modules only
npx vitest run tests/download/            # Download task only
npx vitest run tests/install-analyzers/   # Legacy install task only
npx vitest --watch                        # Watch mode
```

### Mocking Strategy

- **Azure Pipelines task-lib**: Mock `azure-pipelines-task-lib/task` for task-runner tests
- **@alcops/core**: Mock `executeDownload` and detection functions for task isolation
- **ZIP fixtures**: Created in-memory using `fflate.zipSync()` — no external files needed
- **PE/DLL fixtures**: Real minimal .NET assemblies in `tests/fixtures/` (generated via `dotnet build`, 3.5KB each)

### Adding a New Task

1. Create `tasks/<task-name>/task.json` with a unique GUID, Node24_1 + Node20_1 handlers
2. Create `tasks/<task-name>/src/index.ts` (entry point) and `src/task-runner.ts` (orchestrator)
3. Add task to `esbuild.config.mjs` `tasks` array
4. Add task to `vss-extension.json` `files` and `contributions` arrays
5. Create tests in `tests/<task-name>/`
6. Run `npm test && npm run bundle` to verify

### Shared Modules

Code in `shared/` is imported by multiple tasks and bundled into each task's output by esbuild (tree-shaken). When modifying shared modules:

- Run the **full** test suite (`npm test`), not just one task's tests
- Changes affect all 5 task bundles

### Build & Package

```bash
npm run bundle                  # Dev build (with sourcemaps)
npm run bundle -- --production  # Production build (minified, no sourcemaps)
npm run package                 # Creates .vsix in ./out/
```

The `.vsix` contains all 5 tasks in a single extension install.

## CI/CD

### Versioning

Version numbers are managed by [GitVersion](https://gitversion.net/) using the **GitHubFlow/v1** workflow with `ContinuousDeployment` mode. No pre-release labels — just clean `Major.Minor.Patch`:

```
Tag v0.1.0  →  version 0.1.0
Next commit →  version 0.1.1
Next commit →  version 0.1.2
Tag v0.2.0  →  version 0.2.0
```

Bump versions via:
- **Patch** (default): every commit auto-increments
- **Minor**: add `+semver: minor` to commit message
- **Major**: add `+semver: major` to commit message
- **Tag**: `git tag v0.2.0` sets the exact version

### Pull Requests

The [CI workflow](.github/workflows/ci.yml) runs on every PR touching `azure-devops-extension/`:

- Matrix: Node 20 + Node 24
- Steps: install → lint → test → build → bundle → trial package

### Dev Extension (Auto-publish on main)

Every push to `main` automatically publishes the **dev extension** (`alcops-ado-dev`):

1. GitVersion calculates the next version (e.g., `0.1.3`)
2. Inline `jq` in the workflow stamps all `task.json` version fields (Minor + Patch)
3. `tfx extension publish` pushes to the Marketplace as a private extension
4. The extension is shared with the configured Azure DevOps org

The dev extension has `galleryFlags: ["Preview"]` and is only visible to shared organizations.

### Production Release

The [Release workflow](.github/workflows/release.yml) triggers on `v*` tags:

1. GitVersion extracts the version from the tag
2. Stamps `task.json` files
3. Packages and publishes the production extension (`alcops-ado`)
4. Creates a GitHub Release with the `.vsix` attached

To release:
```bash
git tag v0.1.0
git push origin v0.1.0
```

### Required Secrets & Variables

| Name | Type | Purpose |
|------|------|---------|
| `VISUAL_STUDIO_MARKETPLACE_PAT` | Secret | PAT with **Marketplace (publish)** scope |

## Testing in Azure DevOps

### First-time Setup

1. **Create a Marketplace publisher** at https://marketplace.visualstudio.com/manage
2. **Update publisher** in `vss-extension.json` and `vss-extension.dev.json` with your publisher ID
3. **Create a PAT** in Azure DevOps with **Marketplace (publish)** scope
4. **Configure GitHub**:
   - Secret: `VISUAL_STUDIO_MARKETPLACE_PAT` = your PAT
4. **Share the dev extension** via https://marketplace.visualstudio.com/manage → select the extension → Share → add your org name
5. **Merge to main** — CI auto-publishes the dev extension
6. **Install**: go to `https://dev.azure.com/{org}/_settings/extensions` → Shared tab → Install

### Using in Pipelines

```yaml
# Download ALCops analyzers with automatic TFM detection
- task: ALCopsDownloadAnalyzers@1
  name: alcops
  displayName: 'Download ALCops Analyzers'
  inputs:
    detectUsing: "latest"

# Use the downloaded analyzers
- script: |
    alc.exe /project:"$(Build.SourcesDirectory)" \
      /analyzer:"$(alcops.files)"
```

### Local Testing (without CI)

```bash
# Package the dev extension locally
npm run package:dev

# Publish manually (pass your org and PAT)
npm run publish:dev -- --token MY_PAT
```

### Updating

Subsequent pushes to `main` auto-update the dev extension. Azure DevOps picks up new versions automatically — **no reinstall required**.

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Node.js/TypeScript** over PowerShell | PowerShell isn't guaranteed on all Azure DevOps agents (especially Linux) |
| **5 tasks (1 active + 4 deprecated)** instead of removing legacy tasks | Backward compatibility for existing pipelines; deprecated tasks still function |
| **`@alcops/core` `executeDownload()`** as single entry point | Combines TFM detection + download + extraction; aligns ADO extension with CLI |
| **esbuild** over webpack/tsc output | Single-file bundles (~250-430KB), fast builds (<100ms), zero config |
| **Binary search** (`Buffer.indexOf()`) for DLL analysis | Reads TargetFrameworkAttribute directly from .NET assemblies, no PE parsing or .NET runtime needed |
| **HTTP Range requests** for remote ZIPs | Download ~200KB instead of ~2GB for BC artifacts or ~100MB for VSIX |
| **fflate** for ZIP handling | Pure JS, works on all platforms, used by the VS Code extension too |
| **Node24 primary + Node20 fallback** | Node 24 is Active LTS; Node 20 end-of-support is April 2026 |

## Code Review Checklist

Before submitting a PR:

- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run build`)
- [ ] Bundles successfully (`npm run bundle`)
- [ ] `.vsix` packages (`npm run package`)
- [ ] New code has tests (TDD — write tests first)
- [ ] Shared module changes tested across all affected tasks
- [ ] `task.json` has both `Node24_1` and `Node20_1` execution handlers
- [ ] No secrets or credentials in source code
