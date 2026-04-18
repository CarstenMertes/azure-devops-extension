import * as tl from 'azure-pipelines-task-lib/task';
import { detectFromMarketplace } from './marketplace';
import { createTaskLogger } from '../../../shared/logger';
import { logTaskInputs } from '../../../shared/log-inputs';
import taskJson from '../task.json';

export async function run(): Promise<void> {
    try {
        const logger = createTaskLogger();
        logTaskInputs(logger, taskJson.inputs);

        const channel = tl.getInput('channel') || 'current';
        const specificVersion = tl.getInput('extensionVersion');
        const effectiveChannel = specificVersion || channel;

        logger.info('Detecting TFM from VS Marketplace...');
        const result = await detectFromMarketplace(effectiveChannel, logger);

        tl.setVariable('tfm', result.tfm, false, true);
        tl.setVariable('extensionVersion', result.extensionVersion, false, true);
        tl.setVariable('assemblyVersion', result.assemblyVersion ?? '', false, true);
        tl.setResult(tl.TaskResult.Succeeded, `Detected TFM: ${result.tfm} (AL extension ${result.extensionVersion})`);
    } catch (err: unknown) {
        tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
    }
}
