import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
    TFM_PREFERENCE,
    AL_COMPILER_DLL,
    NUGET_PACKAGE_NAME,
    NUGET_FLAT_CONTAINER,
    VS_MARKETPLACE_API,
    AL_EXTENSION_ID,
    VSIX_DLL_PATH,
} from '@alcops/core';

const ROOT = path.resolve(__dirname, '..');
const TASKS_DIR = path.resolve(ROOT, 'tasks');

describe('scaffold: shared types', () => {
    it('should export TFM_PREFERENCE with net8.0 and netstandard2.1', () => {
        expect(TFM_PREFERENCE).toContain('net8.0');
        expect(TFM_PREFERENCE).toContain('netstandard2.1');
    });

    it('should export AL_COMPILER_DLL', () => {
        expect(AL_COMPILER_DLL).toBe('Microsoft.Dynamics.Nav.CodeAnalysis.dll');
    });

    it('should export NUGET constants', () => {
        expect(NUGET_PACKAGE_NAME).toBe('ALCops.Analyzers');
        expect(NUGET_FLAT_CONTAINER).toContain('api.nuget.org');
    });

    it('should export VS Marketplace constants', () => {
        expect(VS_MARKETPLACE_API).toContain('marketplace.visualstudio.com');
        expect(AL_EXTENSION_ID).toBe('ms-dynamics-smb.al');
        expect(VSIX_DLL_PATH).toContain('Analyzers/');
    });
});

describe('scaffold: task.json files', () => {
    const taskDirs = [
        'install-analyzers',
        'detect-tfm-bc-artifact',
        'detect-tfm-nuget-devtools',
        'detect-tfm-marketplace',
    ];

    for (const taskDir of taskDirs) {
        it(`should have a valid task.json for ${taskDir}`, () => {
            const taskJsonPath = path.join(TASKS_DIR, taskDir, 'task.json');
            expect(fs.existsSync(taskJsonPath)).toBe(true);

            const taskJson = JSON.parse(fs.readFileSync(taskJsonPath, 'utf-8'));
            expect(taskJson.id).toBeTruthy();
            expect(taskJson.name).toBeTruthy();
            expect(taskJson.execution).toHaveProperty('Node24_1');
            expect(taskJson.execution).toHaveProperty('Node20_1');
        });

        it(`should have src/index.ts for ${taskDir}`, () => {
            const indexPath = path.join(TASKS_DIR, taskDir, 'src', 'index.ts');
            expect(fs.existsSync(indexPath)).toBe(true);
        });
    }
});

describe('scaffold: test fixtures', () => {
    const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

    it('should have compiler-net80 fixture DLL', () => {
        const dll = path.join(FIXTURES_DIR, 'compiler-net80', 'Microsoft.Dynamics.Nav.CodeAnalysis.dll');
        expect(fs.existsSync(dll)).toBe(true);
        expect(fs.statSync(dll).size).toBeGreaterThan(0);
    });

    it('should have compiler-netstandard21 fixture DLL', () => {
        const dll = path.join(FIXTURES_DIR, 'compiler-netstandard21', 'Microsoft.Dynamics.Nav.CodeAnalysis.dll');
        expect(fs.existsSync(dll)).toBe(true);
        expect(fs.statSync(dll).size).toBeGreaterThan(0);
    });
});
