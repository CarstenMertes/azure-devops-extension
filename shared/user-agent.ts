import * as os from 'os';

/**
 * Build the User-Agent string sent on NuGet HTTP requests.
 * Uses the `vsts-task-installer` known-client pattern recognised by NuGet.org's
 * CDN log parser so downloads appear in per-package statistics.
 */
export function getUserAgent(version: string): string {
    return `vsts-task-installer/${version} (Node.js ${process.version}; ${os.type()} ${os.release()})`;
}
