import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logTaskInputs, type TaskInputDef } from '@shared/log-inputs';
import type { Logger } from '@shared/logger';

vi.mock('azure-pipelines-task-lib/task', () => ({
    getInput: vi.fn(),
}));

import * as tl from 'azure-pipelines-task-lib/task';

function createSpyLogger(): Logger & { messages: string[] } {
    const messages: string[] = [];
    return {
        messages,
        info: vi.fn((msg: string) => messages.push(msg)),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}

describe('logTaskInputs', () => {
    beforeEach(() => {
        vi.mocked(tl.getInput).mockReset();
    });

    it('prints header line', () => {
        const logger = createSpyLogger();
        const inputs: TaskInputDef[] = [{ name: 'foo' }];
        vi.mocked(tl.getInput).mockReturnValue('bar');

        logTaskInputs(logger, inputs);

        expect(logger.messages[0]).toBe('*** Task Inputs:');
    });

    it('prints nothing for empty inputs array', () => {
        const logger = createSpyLogger();

        logTaskInputs(logger, []);

        expect(logger.info).not.toHaveBeenCalled();
    });

    it('prints input name and value with trailing blank line', () => {
        const logger = createSpyLogger();
        const inputs: TaskInputDef[] = [{ name: 'artifactUrl' }];
        vi.mocked(tl.getInput).mockReturnValue('https://example.com');

        logTaskInputs(logger, inputs);

        expect(logger.messages[1]).toBe('artifactUrl  https://example.com');
        expect(logger.messages[2]).toBe('');
    });

    it('aligns values in a vertical column', () => {
        const logger = createSpyLogger();
        const inputs: TaskInputDef[] = [
            { name: 'version' },
            { name: 'packageSource' },
            { name: 'tfm' },
        ];
        vi.mocked(tl.getInput)
            .mockReturnValueOnce('latest')
            .mockReturnValueOnce('nuget')
            .mockReturnValueOnce('net8.0');

        logTaskInputs(logger, inputs);

        // 'packageSource' is 13 chars (longest), padded to 15 (13+2)
        expect(logger.messages[1]).toBe('version        latest');
        expect(logger.messages[2]).toBe('packageSource  nuget');
        expect(logger.messages[3]).toBe('tfm            net8.0');
    });

    it('falls back to defaultValue when input is not set', () => {
        const logger = createSpyLogger();
        const inputs: TaskInputDef[] = [
            { name: 'version', defaultValue: 'latest' },
            { name: 'tfm', defaultValue: '' },
        ];
        vi.mocked(tl.getInput).mockReturnValue(undefined as unknown as string);

        logTaskInputs(logger, inputs);

        expect(logger.messages[1]).toBe('version  latest');
        expect(logger.messages[2]).toBe('tfm      ');
    });

    it('shows empty string when no value and no defaultValue', () => {
        const logger = createSpyLogger();
        const inputs: TaskInputDef[] = [{ name: 'outputPath' }];
        vi.mocked(tl.getInput).mockReturnValue(undefined as unknown as string);

        logTaskInputs(logger, inputs);

        expect(logger.messages[1]).toBe('outputPath  ');
    });

    it('masks secureString inputs', () => {
        const logger = createSpyLogger();
        const inputs: TaskInputDef[] = [
            { name: 'token', type: 'secureString' },
        ];
        vi.mocked(tl.getInput).mockReturnValue('my-secret-token');

        logTaskInputs(logger, inputs);

        expect(logger.messages[1]).toBe('token  ********');
        expect(logger.messages[1]).not.toContain('my-secret-token');
    });

    it('does not mask non-secure inputs', () => {
        const logger = createSpyLogger();
        const inputs: TaskInputDef[] = [
            { name: 'version', type: 'string' },
        ];
        vi.mocked(tl.getInput).mockReturnValue('1.2.3');

        logTaskInputs(logger, inputs);

        expect(logger.messages[1]).toBe('version  1.2.3');
    });

    it('prefers explicit value over defaultValue', () => {
        const logger = createSpyLogger();
        const inputs: TaskInputDef[] = [
            { name: 'version', defaultValue: 'latest' },
        ];
        vi.mocked(tl.getInput).mockReturnValue('2.0.0');

        logTaskInputs(logger, inputs);

        expect(logger.messages[1]).toBe('version  2.0.0');
    });
});
