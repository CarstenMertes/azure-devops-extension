import * as tl from 'azure-pipelines-task-lib/task';
import type { Logger } from '@alcops/core';

export type { Logger } from '@alcops/core';
export { nullLogger } from '@alcops/core';

/**
 * Create a logger that maps to Azure DevOps pipeline logging commands.
 * - info  → console.log  (always visible)
 * - debug → tl.debug     (visible when System.Debug=true)
 * - warn  → tl.warning   (yellow annotation, always visible)
 * - error → tl.error     (red annotation, always visible)
 */
export function createTaskLogger(): Logger {
    return {
        info: (msg) => console.log(msg),
        debug: (msg) => tl.debug(msg),
        warn: (msg) => tl.warning(msg),
        error: (msg) => tl.error(msg),
    };
}
