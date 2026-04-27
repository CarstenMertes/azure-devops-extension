import { describe, it, expect } from 'vitest';
import { getUserAgent } from '../../shared/user-agent';

describe('getUserAgent', () => {
    it('returns vsts-task-installer format with version', () => {
        const ua = getUserAgent('1.2.3');
        expect(ua).toMatch(/^vsts-task-installer\/1\.2\.3 \(Node\.js v\d+\.\d+\.\d+; \w+ .+\)$/);
    });

    it('includes process.version and os info', () => {
        const ua = getUserAgent('0.0.1');
        expect(ua).toContain(`Node.js ${process.version}`);
        expect(ua).toContain('vsts-task-installer/0.0.1');
    });

    it('works with pre-release style versions', () => {
        const ua = getUserAgent('2.0.0-beta.1');
        expect(ua).toMatch(/^vsts-task-installer\/2\.0\.0-beta\.1 \(/);
    });
});
