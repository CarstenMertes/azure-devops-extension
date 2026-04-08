import { TfmDetectionResult } from '../../../shared/types';
import { getTargetFrameworkFromDotNetVersion } from '../../../shared/version-threshold';
import { extractRemoteZipEntry } from '../../../shared/http-range';
import { buildArtifactVariantUrl, downloadFullZip } from '../../../shared/bc-artifact-url';
import { extractZipEntryFromBuffer } from '../../../shared/zip-local';
import { detectTfmFromVsixBuffer } from '../../../shared/vsix-tfm';

const VSIX_FILENAME = 'ALLanguage.vsix';

interface BCArtifactManifest {
    dotNetVersion?: string;
    platformUrl?: string;
    version?: string;
    [key: string]: unknown;
}

/**
 * Detect TFM from a BC artifact URL using a 3-step waterfall:
 *
 * A) Read `dotNetVersion` from the artifact's manifest.json (fast path)
 * B) Download the "core" artifact variant and extract TFM from the ALLanguage.vsix
 * C) Use HTTP Range on the "platform" artifact to extract TFM from the ALLanguage.vsix
 */
export async function detectFromBCArtifact(artifactUrl: string): Promise<TfmDetectionResult> {
    // Step A: manifest.json dotNetVersion
    let manifest: BCArtifactManifest = {};
    try {
        const manifestBuffer = await extractRemoteZipEntry(artifactUrl, 'manifest.json');
        manifest = JSON.parse(manifestBuffer.toString('utf-8'));

        if (manifest.dotNetVersion) {
            const tfm = getTargetFrameworkFromDotNetVersion(manifest.dotNetVersion);
            return {
                tfm,
                source: 'bc-artifact',
                details: `dotNetVersion=${manifest.dotNetVersion} from ${artifactUrl}`,
            };
        }
    } catch {
        // manifest.json not found or unparseable; fall through to Steps B/C
    }

    // Step B: "core" artifact fallback
    const coreResult = await tryDetectFromCoreArtifact(artifactUrl);
    if (coreResult) {
        return coreResult;
    }

    // Step C: "platform" artifact fallback via HTTP Range
    return detectFromPlatformArtifact(artifactUrl, manifest);
}

/**
 * Try to detect TFM from the "core" artifact variant.
 * Returns null if the core artifact doesn't exist (HTTP error).
 */
async function tryDetectFromCoreArtifact(
    artifactUrl: string,
): Promise<TfmDetectionResult | null> {
    const coreUrl = buildArtifactVariantUrl(artifactUrl, 'core');

    let coreZipBuffer: Buffer;
    try {
        coreZipBuffer = await downloadFullZip(coreUrl);
    } catch {
        return null;
    }

    const vsixBuffer = extractZipEntryFromBuffer(coreZipBuffer, VSIX_FILENAME);
    const { tfm, assemblyVersion } = detectTfmFromVsixBuffer(vsixBuffer);

    return {
        tfm,
        source: 'bc-artifact',
        details: `assemblyVersion=${assemblyVersion} from core artifact ${coreUrl}`,
    };
}

/**
 * Detect TFM from the "platform" artifact using HTTP Range requests.
 * Uses `platformUrl` from manifest.json if available, otherwise
 * constructs the URL by replacing the country segment with "platform".
 */
async function detectFromPlatformArtifact(
    artifactUrl: string,
    manifest: BCArtifactManifest,
): Promise<TfmDetectionResult> {
    let platformUrl: string;
    if (manifest.platformUrl) {
        platformUrl = resolvePlatformUrl(artifactUrl, manifest.platformUrl);
    } else {
        platformUrl = buildArtifactVariantUrl(artifactUrl, 'platform');
    }

    const vsixBuffer = await extractRemoteZipEntry(platformUrl, VSIX_FILENAME);
    const { tfm, assemblyVersion } = detectTfmFromVsixBuffer(vsixBuffer);

    return {
        tfm,
        source: 'bc-artifact',
        details: `assemblyVersion=${assemblyVersion} from platform artifact ${platformUrl}`,
    };
}

/**
 * Resolve a platformUrl value from manifest.json.
 * If it's already a full URL, use it as-is.
 * If it's a relative path, prepend the host from the artifact URL.
 */
function resolvePlatformUrl(artifactUrl: string, platformUrl: string): string {
    if (platformUrl.startsWith('https://')) {
        return platformUrl;
    }
    const url = new URL(artifactUrl.split('?')[0]);
    return `https://${url.host}/${platformUrl.replace(/^\//, '')}`;
}
