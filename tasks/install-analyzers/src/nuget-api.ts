import * as fs from 'fs';
import * as path from 'path';
import { compare, prerelease, valid } from 'semver';
import { NUGET_PACKAGE_NAME, NUGET_FLAT_CONTAINER, RegistrationVersion } from '../../../shared/types';
import { Logger, nullLogger } from '../../../shared/logger';
import { queryNuGetRegistration } from '../../../shared/nuget-registration';
import { httpsGetBuffer } from '../../../shared/http-client';
import { getUserAgent } from '../../../shared/user-agent';
import taskJson from '../task.json';

const packageId = NUGET_PACKAGE_NAME.toLowerCase();
const { Major, Minor, Patch } = taskJson.version;
const USER_AGENT = getUserAgent(`${Major}.${Minor}.${Patch}`);

export interface ResolvedVersion {
    version: string;
    packageContentUrl?: string;
}

/**
 * Resolve the version to download.
 * - 'latest': last listed stable version from NuGet Registration API
 * - 'prerelease': last listed version including pre-release
 * - specific version: returned as-is (no packageContentUrl)
 */
export async function resolveVersion(requested: string, logger: Logger = nullLogger): Promise<ResolvedVersion> {
    if (requested !== 'latest' && requested !== 'prerelease') {
        logger.info(`Using specified ALCops version: ${requested}`);
        return { version: requested };
    }

    logger.info(`Resolving ALCops version: '${requested}'`);
    const allVersions = await queryNuGetRegistration(NUGET_PACKAGE_NAME, USER_AGENT, logger);

    const listed = allVersions
        .filter((v) => v.listed)
        .filter((v) => valid(v.version) !== null);

    if (listed.length === 0) {
        throw new Error(`No listed versions found for ${NUGET_PACKAGE_NAME}`);
    }

    let candidates: RegistrationVersion[];
    if (requested === 'latest') {
        candidates = listed.filter((v) => prerelease(v.version) === null);
        if (candidates.length === 0) {
            throw new Error(`No stable versions found for ${NUGET_PACKAGE_NAME}`);
        }
    } else {
        // 'prerelease': all listed versions
        candidates = listed;
    }

    candidates.sort((a, b) => compare(a.version, b.version));
    const best = candidates[candidates.length - 1];

    logger.info(`Resolved to: ${best.version}`);
    return { version: best.version, packageContentUrl: best.packageContent };
}

/** Build the V3 Flat Container download URL for a specific version. */
export function getDownloadUrl(version: string): string {
    const lowerVersion = version.toLowerCase();
    return `${NUGET_FLAT_CONTAINER}/${packageId}/${lowerVersion}/${packageId}.${lowerVersion}.nupkg`;
}

/** Download the .nupkg to a dest directory, return the file path. */
export async function downloadPackage(
    version: string,
    destDir: string,
    logger: Logger = nullLogger,
    packageContentUrl?: string,
): Promise<string> {
    const url = packageContentUrl ?? getDownloadUrl(version);
    logger.info('Downloading ALCops package from NuGet...');
    logger.debug(`Download URL: ${url}`);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    const destPath = path.join(destDir, 'package.nupkg');
    const data = await httpsGetBuffer(url, USER_AGENT);
    fs.writeFileSync(destPath, data);
    logger.debug(`Package saved to: ${destPath} (${data.length} bytes)`);
    return destPath;
}