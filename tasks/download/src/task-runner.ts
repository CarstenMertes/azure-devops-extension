import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import {
    executeDownload,
    type DetectSource,
    type DownloadOptions,
} from '@alcops/core';
import { createTaskLogger } from '../../../shared/logger';
import { logTaskInputs } from '../../../shared/log-inputs';
import taskJson from '../task.json';

export async function run(): Promise<void> {
    try {
        const logger = createTaskLogger();
        logTaskInputs(logger, taskJson.inputs);

        const detectUsing = tl.getInput('detectUsing');
        const detectFrom = tl.getInput('detectFrom') as DetectSource | undefined;
        const tfm = tl.getInput('tfm');
        const version = tl.getInput('version') || 'latest';
        const outputPath = tl.getPathInput('outputPath') ||
            path.join(tl.getVariable('Build.SourcesDirectory') || '.', '.alcops');

        if (!detectUsing && !tfm) {
            throw new Error('Either detectUsing or tfm must be provided');
        }

        logger.info('Downloading ALCops Analyzers...');

        const options: DownloadOptions = {
            detectSource: detectUsing || undefined,
            detectFrom: detectFrom || undefined,
            tfm: tfm || undefined,
            version,
            outputDir: outputPath,
        };

        const result = await executeDownload(options, logger);

        tl.setVariable('version', result.version, false, true);
        tl.setVariable('tfm', result.tfm, false, true);
        tl.setVariable('outputDir', result.outputDir, false, true);
        tl.setVariable('files', result.files.join(';'), false, true);
        tl.setResult(tl.TaskResult.Succeeded, `ALCops downloaded: ${result.files.length} analyzer(s) (${result.tfm})`);
    } catch (err: unknown) {
        tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
    }
}
