import * as fs from 'fs';
import * as path from 'path';
import * as PEStruct from 'pe-struct';
import { TargetFramework, TfmDetectionResult, AL_COMPILER_DLL } from '../../../shared/types';
import { getTargetFrameworkFromVersion } from '../../../shared/version-threshold';
import { Logger, nullLogger } from '../../../shared/logger';

interface DllAnalysis {
    relativePath: string;
    absolutePath: string;
    version: string;
    tfm: TargetFramework;
}

/**
 * Find all instances of AL_COMPILER_DLL in the given directory.
 * Fast path: if the DLL exists in the root, return only that path (no recursive search).
 * Fallback: recursively search all subdirectories.
 */
export function findDllFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
        throw new Error(`Compiler path directory does not exist: ${dirPath}`);
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
        throw new Error(`Compiler path is not a directory: ${dirPath}`);
    }

    const rootDll = path.join(dirPath, AL_COMPILER_DLL);
    if (fs.existsSync(rootDll)) {
        return [rootDll];
    }

    const entries = fs.readdirSync(dirPath, { recursive: true, withFileTypes: true });
    const found: string[] = [];
    for (const entry of entries) {
        if (entry.isFile() && entry.name === AL_COMPILER_DLL) {
            found.push(path.join(entry.parentPath, entry.name));
        }
    }
    return found;
}

/**
 * Parse a single DLL and extract its assembly version and TFM.
 */
function analyzeDll(dllPath: string, basePath: string): DllAnalysis {
    const buffer = fs.readFileSync(dllPath);
    const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    );

    let parsed: ReturnType<typeof PEStruct.load>;
    try {
        parsed = PEStruct.load(arrayBuffer);
    } catch {
        throw new Error(`Failed to parse PE structure: ${dllPath}`);
    }

    const assembly = parsed?.mdtAssembly?.values?.[0];
    if (!assembly) {
        throw new Error(`No Assembly metadata found in: ${dllPath}`);
    }

    const version = [
        assembly.MajorVersion.value,
        assembly.MinorVersion.value,
        assembly.BuildNumber.value,
        assembly.RevisionNumber.value,
    ].join('.');

    return {
        relativePath: path.relative(basePath, dllPath),
        absolutePath: dllPath,
        version,
        tfm: getTargetFrameworkFromVersion(version),
    };
}

function formatDllTable(analyses: DllAnalysis[]): string {
    const lines = analyses.map(
        (a) => `  ${a.relativePath}  (v${a.version} → ${a.tfm})`,
    );
    return lines.join('\n');
}

/**
 * Detect TFM from a directory containing Microsoft.Dynamics.Nav.CodeAnalysis.dll.
 * Searches the root directory first (fast path), then recursively if not found.
 * When multiple DLLs are found, all must resolve to the same TFM.
 */
export async function detectFromCompilerPath(dirPath: string, logger: Logger = nullLogger): Promise<TfmDetectionResult> {
    logger.info(`Detecting TFM from compiler at: ${dirPath}`);

    const dllPaths = findDllFiles(dirPath);

    if (dllPaths.length === 0) {
        throw new Error(
            `No ${AL_COMPILER_DLL} found in ${dirPath} or any subdirectory`,
        );
    }

    const analyses = dllPaths.map((p) => analyzeDll(p, dirPath));

    if (analyses.length === 1) {
        const a = analyses[0];
        logger.info(`Found: ${a.relativePath}`);
        logger.info(`Assembly version: ${a.version} → TFM: ${a.tfm}`);
        return {
            tfm: a.tfm,
            source: 'compiler-path',
            details: `${AL_COMPILER_DLL} v${a.version}`,
        };
    }

    const table = formatDllTable(analyses);
    logger.info(`Found ${analyses.length} ${AL_COMPILER_DLL} files:\n${table}`);

    const uniqueTfms = new Set(analyses.map((a) => a.tfm));
    if (uniqueTfms.size > 1) {
        throw new Error(
            `Conflicting TFMs detected across multiple compiler DLLs:\n${table}`,
        );
    }

    const tfm = analyses[0].tfm;
    logger.info(`All DLLs resolve to the same TFM: ${tfm}`);

    return {
        tfm,
        source: 'compiler-path',
        details: `${analyses.length} DLLs found, all v${analyses.map((a) => a.version).join(', v')}`,
    };
}
