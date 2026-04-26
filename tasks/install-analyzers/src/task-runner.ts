import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { TargetFramework } from '@alcops/core';
import { createTaskLogger } from '../../../shared/logger';
import { logTaskInputs } from '../../../shared/log-inputs';
import { resolveVersion, downloadPackage } from './nuget-api';
import { extractAnalyzers } from './nuget-extractor';
import { detectFromCompilerPath } from './compiler-path';
import taskJson from '../task.json';

export async function run(): Promise<void> {
    // 1. Read inputs
    const logger = createTaskLogger();
    logTaskInputs(logger, taskJson.inputs);

    const version = tl.getInput('version') || 'latest';
    const packageSource = tl.getInput('packageSource') || 'nuget';
    const localPackagePath = tl.getPathInput('localPackagePath');
    const tfmInput = tl.getInput('tfm') as TargetFramework | undefined;
    const compilerPath = tl.getPathInput('compilerPath');
    const outputPath = tl.getPathInput('outputPath') ||
        path.join(tl.getVariable('Build.SourcesDirectory') || '.', '.alcops');

    logger.info('Installing ALCops Analyzers...');

    // 2. Determine TFM
    let tfm: TargetFramework;
    if (tfmInput) {
        tfm = tfmInput;
        logger.info(`Using manual TFM: ${tfm}`);
    } else if (compilerPath) {
        const result = await detectFromCompilerPath(compilerPath, logger);
        tfm = result.tfm;
    } else {
        throw new Error('Either tfm or compilerPath must be provided');
    }

    // 3. Get package
    let nupkgPath: string;
    if (packageSource === 'local' && localPackagePath) {
        logger.info(`Using local package: ${localPackagePath}`);
        nupkgPath = localPackagePath;
    } else {
        const resolved = await resolveVersion(version, logger);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alcops-'));
        nupkgPath = await downloadPackage(resolved.version, tmpDir, logger, resolved.packageContentUrl);
        tl.setVariable('alcopsVersion', resolved.version);
    }

    // 4. Extract
    const { extractedPath, files, actualTfm } = await extractAnalyzers(nupkgPath, tfm, outputPath, logger);

    // 5. Set outputs
    tl.setVariable('tfm', actualTfm, false, true);
    tl.setVariable('analyzerPath', extractedPath, false, true);
    tl.setVariable('analyzers', files.join(';'), false, true);
    tl.setResult(tl.TaskResult.Succeeded, `ALCops installed: ${files.length} analyzers (${actualTfm})`);
}
