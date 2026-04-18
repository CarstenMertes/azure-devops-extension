# Copilot Instructions — ALCops Azure DevOps Extension

## Project Identity

Azure DevOps extension providing 4 pipeline tasks for downloading and installing [ALCops](https://alcops.dev) code analyzers for AL (Business Central). The core problem: matching the correct analyzer DLLs to the consumer's AL compiler version via Target Framework Moniker (TFM) detection.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target, Node16 module resolution)
- **Bundler**: esbuild — each task bundles to a single CJS file targeting Node 24
- **Test runner**: vitest with built-in mocking (`vi.mock`, `vi.mocked`)
- **Task SDK**: `azure-pipelines-task-lib` v5 (inputs, outputs, logging)
- **Runtime**: Node 24 primary + Node 20 fallback execution handlers
- **Packaging**: `tfx-cli` produces a single `.vsix` containing all 4 tasks

## Commands

```bash
npm ci              # Install dependencies (use ci, not install)
npm test            # Run all tests (vitest)
npm run build       # TypeScript compilation check (tsc)
npm run bundle      # esbuild → 4 task bundles in tasks/*/dist/
npm run lint        # ESLint on shared/ and tasks/*/src/
npm run package     # Bundle + tfx → production .vsix in ./out/
npm run package:dev # Bundle + tfx → dev .vsix in ./out/
```

## Architecture

4 independent tasks in a single `.vsix`:

| Task | Directory | Purpose |
|------|-----------|---------|
| ALCopsInstallAnalyzers | `tasks/install-analyzers/` | Downloads ALCops from NuGet, extracts correct DLLs |
| ALCopsDetectTfmFromBCArtifact | `tasks/detect-tfm-bc-artifact/` | Detects TFM from BC artifact URL (3-step waterfall) |
| ALCopsDetectTfmFromNuGetDevTools | `tasks/detect-tfm-nuget-devtools/` | Detects TFM from NuGet DevTools package version |
| ALCopsDetectTfmFromMarketplace | `tasks/detect-tfm-marketplace/` | Detects TFM from VS Marketplace AL Language extension |

### Key directories

- `shared/` — Shared TypeScript modules bundled into each task (not runtime-shared)
- `tasks/<name>/src/` — Task source code (entry point + task-runner + logic modules)
- `tasks/<name>/dist/` — esbuild output (gitignored, generated)
- `tests/` — All tests, mirroring the task structure
- `tests/fixtures/` — Real minimal .NET assemblies for PE parsing tests
- `scripts/` — CI/CD scripts (version stamping)

### Entry point pattern

Every task follows the same pattern:
1. `index.ts` — imports and calls `run()` from `task-runner.ts`
2. `task-runner.ts` — orchestrator: reads inputs via `tl.getInput()`, executes logic, sets outputs via `tl.setVariable()`

## ADO Extension Patterns

### task.json

Each task has a `task.json` defining its Azure DevOps contract:
- Must include both `Node24_1` (primary) and `Node20_1` (fallback) in `execution`
- Task `id` is a stable GUID (never changes)
- Task `Major` version only bumps for breaking YAML contract changes
- `Minor` and `Patch` are stamped by CI via inline `jq` in the workflow YAML

### Two-manifest pattern

| File | Extension ID | Trigger |
|------|-------------|---------|
| `vss-extension.json` | `alcops-ado` | `v*` tag → public production |
| `vss-extension.dev.json` | `alcops-ado-dev` | Push to `main` → private dev |

### Inputs and outputs

- Read inputs: `tl.getInput('inputName', required)` or `tl.getPathInput()`
- Set outputs: `tl.setVariable('varName', value, false, true)` (the 4th arg `isOutput` must be `true`)
- Output variables are prefixed by the task's `name` attribute when consumed downstream

## Testing Conventions

### Rules

- **TDD**: write tests before implementation
- **No real network calls**: mock all HTTP at module level via `vi.mock('https')`
- **Module isolation**: each test file mocks its external dependencies
- **Full suite for shared changes**: if you modify `shared/`, run `npm test` (all tests), not just one task's tests

### Mocking patterns

```typescript
// HTTP
vi.mock('https', () => ({ request: vi.fn() }));

// Azure Pipelines task-lib
vi.mock('azure-pipelines-task-lib/task', () => ({
  getInput: vi.fn(),
  setVariable: vi.fn(),
  setResult: vi.fn(),
  TaskResult: { Succeeded: 0, Failed: 2 },
}));

// Shared modules (for task-level isolation)
vi.mock('../../shared/vsix-tfm');
vi.mock('../../shared/http-range');
```

### Fixtures

- ZIP fixtures: created in-memory via `fflate.zipSync()` (no external files)
- PE/DLL fixtures: real minimal .NET assemblies in `tests/fixtures/` (3.5 KB each, generated via `dotnet build`)

## Adding a New Task

1. Create `tasks/<task-name>/task.json` — unique GUID, Node24_1 + Node20_1 handlers
2. Create `tasks/<task-name>/src/index.ts` and `src/task-runner.ts`
3. Add the task name to the `tasks` array in `esbuild.config.mjs`
4. Add entries in `vss-extension.json` `files` and `contributions` arrays (and `vss-extension.dev.json`)
5. Create tests in `tests/<task-name>/`
6. Verify: `npm test && npm run bundle`

## Versioning

- [GitVersion](https://gitversion.net/) with GitHubFlow/v1, ContinuousDeployment mode
- Every commit auto-increments Patch
- Use `+semver: minor` or `+semver: major` in commit messages for bumps
- Production releases: `git tag v0.2.0 && git push origin v0.2.0`

## Path Aliases

TypeScript and vitest both use the `@shared/*` alias for imports from `shared/`:
- `tsconfig.json`: `"@shared/*": ["./shared/*"]`
- `vitest.config.ts`: `alias: { '@shared': path.resolve(__dirname, 'shared') }`

## Common Pitfalls

- **Missing Node handler**: every `task.json` needs both `Node24_1` and `Node20_1` execution entries
- **Shared modules aren't runtime-shared**: they're bundled into each task by esbuild. No `node_modules` sharing at runtime.
- **Output variables need `isOutput: true`**: the 4th argument to `tl.setVariable()` must be `true` for downstream tasks to read the value
- **Don't commit `tasks/*/dist/`**: these are gitignored build artifacts
- **PE fixtures are real binaries**: `tests/fixtures/` contains .NET assemblies with embedded TFM and version attributes. Don't manually edit them.
- **PE fixtures are real binaries**: `tests/fixtures/` contains .NET assemblies. Don't manually edit them.

## Documentation

- `.github/ARCHITECTURE.md` — full technical architecture
- `CONTRIBUTING.md` (repo root) — development workflow, CI/CD, testing guide
- `.github/OVERVIEW.md` — high-level project overview
- `README.md` — user-facing documentation (Marketplace listing source)
- `overview.md` — Marketplace detail page content
