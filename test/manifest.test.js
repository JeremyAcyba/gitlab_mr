'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const contentScript = manifest.content_scripts[0];

test('every file listed in the manifest exists', () => {
    const declared = [
        manifest.action.default_popup,
        ...Object.values(manifest.icons),
        ...contentScript.js,
        ...contentScript.css
    ];

    for (const file of declared) {
        assert.ok(fs.existsSync(path.join(rootDir, file)), `${file} is declared but missing`);
    }
});

test('the content scripts load in an order that satisfies their dependencies', () => {
    // Reproduces what Chrome does: run each file, in order, in one shared
    // global. A file destructuring a namespace that is not there yet throws,
    // which is exactly the manifest mistake we want to catch here.
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        fetch: () => Promise.reject(new Error('not called at load time')),
        AbortSignal: { timeout: () => null },
        MutationObserver: class {
            observe() {}
            disconnect() {}
        },
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({ classList: { add() {} }, setAttribute() {}, addEventListener() {} })
        },
        chrome: { storage: { sync: { get: async () => ({}), set: async () => {} } } },
        location: { href: 'https://gitlab.example/', origin: 'https://gitlab.example', pathname: '/' }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    // main.js is excluded: it bootstraps on load and needs a real page.
    for (const file of contentScript.js.filter((name) => !name.endsWith('main.js'))) {
        const code = fs.readFileSync(path.join(rootDir, file), 'utf8');
        assert.doesNotThrow(
            () => vm.runInContext(code, sandbox, { filename: file }),
            `${file} failed to load`
        );
    }

    assert.deepEqual(
        Object.keys(sandbox.GitlabMrTools).sort(),
        ['api', 'decorate', 'dom', 'instance', 'pages', 'review', 'settings', 'status', 'threads'].sort()
    );
});

test('the extension asks for no permission it does not use', () => {
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.equal(manifest.manifest_version, 3);
    // `<all_urls>` would also cover file:// and other schemes we never touch.
    assert.deepEqual(contentScript.matches, ['http://*/*', 'https://*/*']);
});

test('no popup or content asset is pulled from a third party', () => {
    const assets = ['src/popup/index.html', 'src/popup/style.css', 'src/content/content.css'];

    for (const asset of assets) {
        const content = fs.readFileSync(path.join(rootDir, asset), 'utf8');
        // Only actual resource references matter; a placeholder mentioning
        // https://gitlab.com fetches nothing.
        assert.doesNotMatch(
            content,
            /(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import\s+["']?https?:/i,
            `${asset} references a remote resource`
        );
    }
});
