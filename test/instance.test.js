'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** instance.js registers itself on a namespace, so load it the way Chrome does. */
function loadInstanceModule() {
    const sandbox = { console, URL };
    sandbox.globalThis = sandbox;
    sandbox.GitlabMrTools = { api: { GitlabApi: class {} } };
    vm.createContext(sandbox);

    const file = path.join(__dirname, '..', 'src', 'content', 'instance.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: 'instance.js' });

    return sandbox.GitlabMrTools.instance;
}

const instanceModule = loadInstanceModule();

/**
 * The module runs in its own realm, so its arrays do not share our Array
 * prototype; copying keeps `deepEqual` about the values.
 *
 * @returns {string[]}
 */
function bases(pathname, landmarkHrefs) {
    return [...instanceModule.candidateBasePaths(pathname, landmarkHrefs)];
}

test('the instance root is always a candidate, and the last one', () => {
    assert.deepEqual(bases('/group/project/-/merge_requests', [null, null]), ['']);
});

test('a sub-path install is read off the opensearch link', () => {
    const candidates = bases('/gitlab/group/project/-/merge_requests', [
        '/gitlab/search/opensearch.xml',
        null
    ]);

    assert.deepEqual(candidates, ['/gitlab', '']);
});

test('the manifest link works just as well', () => {
    const candidates = bases('/gitlab/dashboard/merge_requests', [
        null,
        'https://host.example/gitlab/-/manifest.json'
    ]);

    assert.equal(candidates[0], '/gitlab');
    assert.equal(candidates.at(-1), '');
});

test('the dashboard and group landmarks give a candidate of their own', () => {
    assert.deepEqual(bases('/gitlab/dashboard/merge_requests', [null, null]), ['/gitlab', '']);
    assert.deepEqual(bases('/gitlab/groups/team/-/merge_requests', [null, null]), ['/gitlab', '']);
});

test('candidates are not duplicated when the sources agree', () => {
    const candidates = bases('/gitlab/dashboard/merge_requests', [
        '/gitlab/search/opensearch.xml',
        '/gitlab/-/manifest.json'
    ]);

    assert.deepEqual(candidates, ['/gitlab', '']);
});

test('a landmark that does not match the expected shape is ignored', () => {
    assert.deepEqual(bases('/group/project/-/merge_requests', ['/whatever', null]), ['']);
});
