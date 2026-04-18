import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('azure-pipelines-task-lib/task', () => ({
    getInput: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    setVariable: vi.fn(),
    setResult: vi.fn(),
    TaskResult: { Succeeded: 0, Failed: 2 },
}));

vi.mock('../../tasks/detect-tfm-marketplace/src/marketplace', () => ({
    detectFromMarketplace: vi.fn(),
}));

import * as tl from 'azure-pipelines-task-lib/task';
import { detectFromMarketplace } from '../../tasks/detect-tfm-marketplace/src/marketplace';
import { run } from '../../tasks/detect-tfm-marketplace/src/task-runner';

const mockGetInput = vi.mocked(tl.getInput);
const mockSetVariable = vi.mocked(tl.setVariable);
const mockSetResult = vi.mocked(tl.setResult);
const mockDetect = vi.mocked(detectFromMarketplace);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('task-runner', () => {
    it('uses channel input and sets all output variables', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'channel') return 'current';
            if (name === 'extensionVersion') return undefined as unknown as string;
            return undefined as unknown as string;
        });
        mockDetect.mockResolvedValue({
            tfm: 'net8.0',
            source: 'vs-marketplace',
            extensionVersion: '15.0.100.0',
            assemblyVersion: '17.0.0.0',
        });

        await run();

        expect(mockDetect).toHaveBeenCalledWith('current', expect.any(Object));
        expect(mockSetVariable).toHaveBeenCalledWith('tfm', 'net8.0', false, true);
        expect(mockSetVariable).toHaveBeenCalledWith('extensionVersion', '15.0.100.0', false, true);
        expect(mockSetVariable).toHaveBeenCalledWith('assemblyVersion', '17.0.0.0', false, true);
        expect(mockSetResult).toHaveBeenCalledWith(
            tl.TaskResult.Succeeded,
            expect.stringContaining('net8.0'),
        );
    });

    it('uses extensionVersion input when provided (overrides channel)', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'channel') return 'current';
            if (name === 'extensionVersion') return '14.0.50.0';
            return undefined as unknown as string;
        });
        mockDetect.mockResolvedValue({
            tfm: 'netstandard2.1',
            source: 'vs-marketplace',
            extensionVersion: '14.0.50.0',
            assemblyVersion: '14.0.0.0',
        });

        await run();

        expect(mockDetect).toHaveBeenCalledWith('14.0.50.0', expect.any(Object));
    });

    it('defaults channel to "current" when not provided', async () => {
        mockGetInput.mockReturnValue(undefined as unknown as string);
        mockDetect.mockResolvedValue({
            tfm: 'net8.0',
            source: 'vs-marketplace',
            extensionVersion: '15.0.100.0',
            assemblyVersion: '17.0.0.0',
        });

        await run();

        expect(mockDetect).toHaveBeenCalledWith('current', expect.any(Object));
    });

    it('sets TaskResult.Failed on error', async () => {
        mockGetInput.mockReturnValue(undefined as unknown as string);
        mockDetect.mockRejectedValue(new Error('Network failure'));

        await run();

        expect(mockSetResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Network failure');
    });

    it('sets assemblyVersion to empty string when null', async () => {
        mockGetInput.mockImplementation((name: string) => {
            if (name === 'channel') return 'current';
            return undefined as unknown as string;
        });
        mockDetect.mockResolvedValue({
            tfm: 'net8.0',
            source: 'vs-marketplace',
            extensionVersion: '15.0.100.0',
            assemblyVersion: null,
        });

        await run();

        expect(mockSetVariable).toHaveBeenCalledWith('assemblyVersion', '', false, true);
    });
});
