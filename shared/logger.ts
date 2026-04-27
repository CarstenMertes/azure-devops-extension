import * as tl from 'azure-pipelines-task-lib/task';

export interface Logger {
    info(message: string): void;
    debug(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export const nullLogger: Logger = {
    info() {},
    debug() {},
    warn() {},
    error() {},
};

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
