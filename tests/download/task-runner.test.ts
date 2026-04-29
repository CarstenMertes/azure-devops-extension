import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock azure-pipelines-task-lib ──
vi.mock('azure-pipelines-task-lib/task', () => ({
    getInput: vi.fn(),
    getPathInput: vi.fn(),
    getVariable: vi.fn(),
    setVariable: vi.fn(),
    setResult: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    TaskResult: { Succeeded: 0, Failed: 1 },
}));

// ── Mock @alcops/core ──
vi.mock('@alcops/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@alcops/core')>();
    return {
        ...actual,
        executeDownload: vi.fn(),
    };
});

import * as tl from 'azure-pipelines-task-lib/task';
import { executeDownload } from '@alcops/core';
import { run } from '../../tasks/download/src/task-runner';

const mockGetInput = tl.getInput as ReturnType<typeof vi.fn>;
const mockGetPathInput = tl.getPathInput as ReturnType<typeof vi.fn>;
const mockGetVariable = tl.getVariable as ReturnType<typeof vi.fn>;
const mockSetVariable = tl.setVariable as ReturnType<typeof vi.fn>;
const mockSetResult = tl.setResult as ReturnType<typeof vi.fn>;
const mockExecuteDownload = executeDownload as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();

    mockGetInput.mockReturnValue(undefined);
    mockGetPathInput.mockReturnValue(undefined);
    mockGetVariable.mockReturnValue('/build/src');
});

describe('ALCopsDownloadAnalyzers task-runner', () => {
    it('calls executeDownload with detectUsing input', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'detectUsing') return 'https://bcartifacts.example.com/onprem/26.0';
            if (name === 'version') return 'latest';
            return undefined;
        });

        mockExecuteDownload.mockResolvedValue({
            version: '1.0.0',
            tfm: 'net8.0',
            outputDir: '/build/src/.alcops',
            files: ['/build/src/.alcops/ALCops.Analyzers.dll'],
        });

        await run();

        expect(mockExecuteDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                detectSource: 'https://bcartifacts.example.com/onprem/26.0',
                detectFrom: undefined,
                tfm: undefined,
                version: 'latest',
                outputDir: '/build/src/.alcops',
            }),
            expect.any(Object),
        );
        expect(mockSetVariable).toHaveBeenCalledWith('version', '1.0.0', false, true);
        expect(mockSetVariable).toHaveBeenCalledWith('tfm', 'net8.0', false, true);
        expect(mockSetVariable).toHaveBeenCalledWith('outputDir', '/build/src/.alcops', false, true);
        expect(mockSetVariable).toHaveBeenCalledWith('files', '/build/src/.alcops/ALCops.Analyzers.dll', false, true);
        expect(mockSetResult).toHaveBeenCalledWith(0, expect.stringContaining('1 analyzer(s)'));
    });

    it('calls executeDownload with explicit tfm (skips detection)', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'tfm') return 'net8.0';
            if (name === 'version') return '2.0.0';
            return undefined;
        });

        mockExecuteDownload.mockResolvedValue({
            version: '2.0.0',
            tfm: 'net8.0',
            outputDir: '/build/src/.alcops',
            files: ['/build/src/.alcops/A.dll', '/build/src/.alcops/B.dll'],
        });

        await run();

        expect(mockExecuteDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                detectSource: undefined,
                tfm: 'net8.0',
                version: '2.0.0',
            }),
            expect.any(Object),
        );
        expect(mockSetVariable).toHaveBeenCalledWith('version', '2.0.0', false, true);
        expect(mockSetVariable).toHaveBeenCalledWith('files', '/build/src/.alcops/A.dll;/build/src/.alcops/B.dll', false, true);
    });

    it('passes detectFrom when explicitly set', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'detectUsing') return '26.0.12345.0';
            if (name === 'detectFrom') return 'nuget-devtools';
            if (name === 'version') return 'latest';
            return undefined;
        });

        mockExecuteDownload.mockResolvedValue({
            version: '1.0.0',
            tfm: 'net8.0',
            outputDir: '/build/src/.alcops',
            files: ['/build/src/.alcops/Analyzer.dll'],
        });

        await run();

        expect(mockExecuteDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                detectSource: '26.0.12345.0',
                detectFrom: 'nuget-devtools',
            }),
            expect.any(Object),
        );
    });

    it('uses custom outputPath when provided', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'tfm') return 'net8.0';
            if (name === 'version') return 'latest';
            return undefined;
        });
        mockGetPathInput.mockImplementation((name: string) => {
            if (name === 'outputPath') return '/custom/output';
            return undefined;
        });

        mockExecuteDownload.mockResolvedValue({
            version: '1.0.0',
            tfm: 'net8.0',
            outputDir: '/custom/output',
            files: ['/custom/output/Analyzer.dll'],
        });

        await run();

        expect(mockExecuteDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                outputDir: '/custom/output',
            }),
            expect.any(Object),
        );
    });

    it('fails when neither detectUsing nor tfm is provided', async () => {
        mockGetInput.mockReturnValue(undefined);

        await run();

        expect(mockExecuteDownload).not.toHaveBeenCalled();
        expect(mockSetResult).toHaveBeenCalledWith(1, 'Either detectUsing or tfm must be provided');
    });

    it('fails when executeDownload throws', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'tfm') return 'net8.0';
            if (name === 'version') return 'latest';
            return undefined;
        });

        mockExecuteDownload.mockRejectedValue(new Error('Network error'));

        await run();

        expect(mockSetResult).toHaveBeenCalledWith(1, 'Network error');
    });

    it('defaults version to "latest" when not provided', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'tfm') return 'net8.0';
            return undefined;
        });

        mockExecuteDownload.mockResolvedValue({
            version: '3.0.0',
            tfm: 'net8.0',
            outputDir: '/build/src/.alcops',
            files: [],
        });

        await run();

        expect(mockExecuteDownload).toHaveBeenCalledWith(
            expect.objectContaining({ version: 'latest' }),
            expect.any(Object),
        );
    });
});
