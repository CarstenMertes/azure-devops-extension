import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../shared/http-range', () => ({
    extractRemoteZipEntry: vi.fn(),
}));
vi.mock('../../shared/bc-artifact-url', () => ({
    buildArtifactVariantUrl: vi.fn(),
    downloadFullZip: vi.fn(),
}));
vi.mock('../../shared/zip-local', () => ({
    extractZipEntryFromBuffer: vi.fn(),
}));
vi.mock('../../shared/vsix-tfm', () => ({
    detectTfmFromVsixBuffer: vi.fn(),
}));

import { extractRemoteZipEntry } from '../../shared/http-range';
import { buildArtifactVariantUrl, downloadFullZip } from '../../shared/bc-artifact-url';
import { extractZipEntryFromBuffer } from '../../shared/zip-local';
import { detectTfmFromVsixBuffer } from '../../shared/vsix-tfm';
import { detectFromBCArtifact } from '../../tasks/detect-tfm-bc-artifact/src/bc-artifact';

const mockExtractRemote = vi.mocked(extractRemoteZipEntry);
const mockBuildVariantUrl = vi.mocked(buildArtifactVariantUrl);
const mockDownloadFullZip = vi.mocked(downloadFullZip);
const mockExtractLocal = vi.mocked(extractZipEntryFromBuffer);
const mockDetectVsix = vi.mocked(detectTfmFromVsixBuffer);

const ARTIFACT_URL = 'https://bcartifacts.azureedge.net/sandbox/26.0.12345.0/us';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('detectFromBCArtifact', () => {
    describe('Step A: manifest.json dotNetVersion', () => {
        it('detects net8.0 from manifest with dotNetVersion "8.0.24"', async () => {
            mockExtractRemote.mockResolvedValue(
                Buffer.from(JSON.stringify({ dotNetVersion: '8.0.24', version: '26.0.12345.0' })),
            );

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('net8.0');
            expect(result.source).toBe('bc-artifact');
            expect(result.details).toContain('dotNetVersion=8.0.24');
            expect(mockDownloadFullZip).not.toHaveBeenCalled();
        });

        it('detects netstandard2.1 from manifest with dotNetVersion "6.0.0"', async () => {
            mockExtractRemote.mockResolvedValue(
                Buffer.from(JSON.stringify({ dotNetVersion: '6.0.0' })),
            );

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('netstandard2.1');
            expect(result.source).toBe('bc-artifact');
        });

        it('detects net9.0 from manifest with dotNetVersion "9.0.0"', async () => {
            mockExtractRemote.mockResolvedValue(
                Buffer.from(JSON.stringify({ dotNetVersion: '9.0.0' })),
            );

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('net9.0');
        });
    });

    describe('Step B: core artifact fallback', () => {
        it('falls back to core when dotNetVersion is missing', async () => {
            // Step A: manifest without dotNetVersion
            mockExtractRemote.mockResolvedValueOnce(
                Buffer.from(JSON.stringify({ version: '20.0.12345.0' })),
            );

            // Step B: core download succeeds
            mockBuildVariantUrl.mockReturnValue('https://host/sandbox/20.0.0.0/core');
            const coreZipBuffer = Buffer.from('fake-core-zip');
            mockDownloadFullZip.mockResolvedValue(coreZipBuffer);
            const vsixBuffer = Buffer.from('fake-vsix');
            mockExtractLocal.mockReturnValue(vsixBuffer);
            mockDetectVsix.mockReturnValue({ tfm: 'netstandard2.1', assemblyVersion: '14.0.0.0' });

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('netstandard2.1');
            expect(result.source).toBe('bc-artifact');
            expect(result.details).toContain('assemblyVersion=14.0.0.0');
            expect(result.details).toContain('core artifact');
            expect(mockBuildVariantUrl).toHaveBeenCalledWith(ARTIFACT_URL, 'core');
            expect(mockExtractLocal).toHaveBeenCalledWith(coreZipBuffer, 'ALLanguage.vsix');
            expect(mockDetectVsix).toHaveBeenCalledWith(vsixBuffer);
        });
    });

    describe('Step C: platform artifact fallback', () => {
        it('falls back to platform when both dotNetVersion and core are unavailable', async () => {
            // Step A: manifest without dotNetVersion
            mockExtractRemote.mockResolvedValueOnce(
                Buffer.from(JSON.stringify({ version: '18.0.0.0' })),
            );

            // Step B: core download fails (404)
            mockBuildVariantUrl.mockReturnValue('https://host/sandbox/18.0.0.0/core');
            mockDownloadFullZip.mockRejectedValue(new Error('HTTP 404'));

            // Step C: platform via HTTP Range
            const vsixBuffer = Buffer.from('fake-platform-vsix');
            mockExtractRemote.mockResolvedValueOnce(vsixBuffer);
            mockDetectVsix.mockReturnValue({ tfm: 'netstandard2.1', assemblyVersion: '12.0.0.0' });

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('netstandard2.1');
            expect(result.source).toBe('bc-artifact');
            expect(result.details).toContain('platform artifact');
            // Platform URL should be constructed since manifest has no platformUrl
            expect(mockExtractRemote).toHaveBeenCalledTimes(2);
        });

        it('uses platformUrl from manifest when available', async () => {
            // Step A: manifest with platformUrl but no dotNetVersion
            mockExtractRemote.mockResolvedValueOnce(
                Buffer.from(JSON.stringify({
                    version: '18.0.0.0',
                    platformUrl: 'sandbox/18.0.0.0/platform',
                })),
            );

            // Step B: core fails
            mockBuildVariantUrl.mockReturnValue('https://host/sandbox/18.0.0.0/core');
            mockDownloadFullZip.mockRejectedValue(new Error('HTTP 404'));

            // Step C: platform via HTTP Range using manifest platformUrl
            const vsixBuffer = Buffer.from('fake-platform-vsix');
            mockExtractRemote.mockResolvedValueOnce(vsixBuffer);
            mockDetectVsix.mockReturnValue({ tfm: 'netstandard2.1', assemblyVersion: '12.0.0.0' });

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('netstandard2.1');
            // The platform URL should be resolved from the manifest platformUrl
            expect(mockExtractRemote).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('sandbox/18.0.0.0/platform'),
                'ALLanguage.vsix',
            );
        });

        it('uses full https platformUrl from manifest as-is', async () => {
            mockExtractRemote.mockResolvedValueOnce(
                Buffer.from(JSON.stringify({
                    version: '18.0.0.0',
                    platformUrl: 'https://different-host/sandbox/18.0.0.0/platform',
                })),
            );

            mockBuildVariantUrl.mockReturnValue('https://host/sandbox/18.0.0.0/core');
            mockDownloadFullZip.mockRejectedValue(new Error('HTTP 404'));

            const vsixBuffer = Buffer.from('fake-platform-vsix');
            mockExtractRemote.mockResolvedValueOnce(vsixBuffer);
            mockDetectVsix.mockReturnValue({ tfm: 'netstandard2.1', assemblyVersion: '12.0.0.0' });

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('netstandard2.1');
            expect(mockExtractRemote).toHaveBeenNthCalledWith(
                2,
                'https://different-host/sandbox/18.0.0.0/platform',
                'ALLanguage.vsix',
            );
        });
    });

    describe('Step A failure: manifest.json missing or unparseable', () => {
        it('falls through to Step B when manifest.json is missing from the ZIP', async () => {
            // Step A: extractRemoteZipEntry throws (entry not found)
            mockExtractRemote.mockRejectedValueOnce(
                new Error('Entry not found in ZIP: manifest.json'),
            );

            // Step B: core download succeeds
            mockBuildVariantUrl.mockReturnValue('https://host/sandbox/15.0.0.0/core');
            const coreZipBuffer = Buffer.from('fake-core-zip');
            mockDownloadFullZip.mockResolvedValue(coreZipBuffer);
            const vsixBuffer = Buffer.from('fake-vsix');
            mockExtractLocal.mockReturnValue(vsixBuffer);
            mockDetectVsix.mockReturnValue({ tfm: 'netstandard2.1', assemblyVersion: '10.0.0.0' });

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('netstandard2.1');
            expect(result.source).toBe('bc-artifact');
            expect(result.details).toContain('core artifact');
        });

        it('falls through to Step C when manifest.json is missing and core fails', async () => {
            // Step A: extractRemoteZipEntry throws
            mockExtractRemote.mockRejectedValueOnce(
                new Error('Entry not found in ZIP: manifest.json'),
            );

            // Step B: core download fails
            mockBuildVariantUrl.mockReturnValueOnce('https://host/sandbox/15.0.0.0/core');
            mockDownloadFullZip.mockRejectedValue(new Error('HTTP 404'));

            // Step C: platform via HTTP Range (buildArtifactVariantUrl called again for platform)
            mockBuildVariantUrl.mockReturnValueOnce('https://host/sandbox/15.0.0.0/platform');
            const vsixBuffer = Buffer.from('fake-platform-vsix');
            mockExtractRemote.mockResolvedValueOnce(vsixBuffer);
            mockDetectVsix.mockReturnValue({ tfm: 'netstandard2.1', assemblyVersion: '10.0.0.0' });

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('netstandard2.1');
            expect(result.source).toBe('bc-artifact');
            expect(result.details).toContain('platform artifact');
        });

        it('falls through to Step B when manifest.json contains invalid JSON', async () => {
            // Step A: extraction succeeds but content is not valid JSON
            mockExtractRemote.mockResolvedValueOnce(
                Buffer.from('this is not json'),
            );

            // Step B: core download succeeds
            mockBuildVariantUrl.mockReturnValue('https://host/sandbox/15.0.0.0/core');
            mockDownloadFullZip.mockResolvedValue(Buffer.from('fake-core-zip'));
            mockExtractLocal.mockReturnValue(Buffer.from('fake-vsix'));
            mockDetectVsix.mockReturnValue({ tfm: 'net8.0', assemblyVersion: '17.0.0.0' });

            const result = await detectFromBCArtifact(ARTIFACT_URL);

            expect(result.tfm).toBe('net8.0');
            expect(result.source).toBe('bc-artifact');
            expect(result.details).toContain('core artifact');
        });
    });

    describe('passes correct entry paths', () => {
        it('passes "manifest.json" for manifest extraction', async () => {
            mockExtractRemote.mockResolvedValue(
                Buffer.from(JSON.stringify({ dotNetVersion: '8.0.24' })),
            );

            await detectFromBCArtifact(ARTIFACT_URL);

            expect(mockExtractRemote).toHaveBeenCalledWith(ARTIFACT_URL, 'manifest.json');
        });

        it('passes "ALLanguage.vsix" for VSIX extraction from core', async () => {
            mockExtractRemote.mockResolvedValueOnce(
                Buffer.from(JSON.stringify({ version: '20.0.0.0' })),
            );
            mockBuildVariantUrl.mockReturnValue('https://host/sandbox/20.0.0.0/core');
            mockDownloadFullZip.mockResolvedValue(Buffer.from('zip'));
            mockExtractLocal.mockReturnValue(Buffer.from('vsix'));
            mockDetectVsix.mockReturnValue({ tfm: 'net8.0', assemblyVersion: '17.0.0.0' });

            await detectFromBCArtifact(ARTIFACT_URL);

            expect(mockExtractLocal).toHaveBeenCalledWith(expect.any(Buffer), 'ALLanguage.vsix');
        });
    });
});
