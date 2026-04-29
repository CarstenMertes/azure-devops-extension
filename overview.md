# ALCops for Azure DevOps

Azure DevOps pipeline task for downloading [ALCops](https://alcops.dev) code analyzers for AL Language of Microsoft Dynamics 365 Business Central.

## Features

- **Single-step download** with automatic TFM detection from multiple sources
- **Smart routing** determines the detection source from your input (URL, path, version, or channel keyword)
- **NuGet integration** downloads the latest (or specific) version of ALCops from nuget.org

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

## Links

- [Full documentation on GitHub](https://github.com/ALCops/azure-devops-extension)
- [ALCops Website](https://alcops.dev)
- [Report Issues](https://github.com/ALCops/azure-devops-extension/issues)
