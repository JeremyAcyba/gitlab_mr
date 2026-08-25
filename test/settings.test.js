'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalize, parseGitlabUrl, DEFAULTS, TRACKING, WORK_WITH } = require('../src/shared/settings.js');

test('parseGitlabUrl only accepts http(s)', () => {
    assert.equal(parseGitlabUrl('https://gitlab.com').origin, 'https://gitlab.com');
    assert.equal(parseGitlabUrl('http://gitlab.local:8080').origin, 'http://gitlab.local:8080');
    assert.equal(parseGitlabUrl('javascript:alert(1)'), null);
    assert.equal(parseGitlabUrl('data:text/html,<script>'), null);
    assert.equal(parseGitlabUrl('gitlab.com'), null);
    assert.equal(parseGitlabUrl(''), null);
    assert.equal(parseGitlabUrl(undefined), null);
});

test('normalize falls back to the defaults for anything unusable', () => {
    assert.deepEqual(normalize(undefined), DEFAULTS);
    assert.deepEqual(normalize('nope'), DEFAULTS);
});

test('normalize strips the noise around the instance URL', () => {
    assert.equal(normalize({ url: 'https://gitlab.com/' }).url, 'https://gitlab.com');
    assert.equal(normalize({ url: '  https://gitlab.com  ' }).url, 'https://gitlab.com');
    assert.equal(normalize({ url: 'https://host/gitlab/?a=b#c' }).url, 'https://host/gitlab');
    assert.equal(normalize({ url: 'ftp://gitlab.com' }).url, '');
});

test('normalize turns the form strings back into usable values', () => {
    const settings = normalize({ upvotes: '3', username: '  jeremy  ' });

    assert.equal(settings.upvotes, 3);
    assert.equal(settings.username, 'jeremy');
});

test('normalize rejects an upvote count that would break the comparison', () => {
    assert.equal(normalize({ upvotes: '0' }).upvotes, DEFAULTS.upvotes);
    assert.equal(normalize({ upvotes: '-1' }).upvotes, DEFAULTS.upvotes);
    assert.equal(normalize({ upvotes: 'abc' }).upvotes, DEFAULTS.upvotes);
});

test('normalize only keeps known enum values', () => {
    assert.equal(normalize({ tracking: 'not_mine' }).tracking, TRACKING.NOT_MINE);
    assert.equal(normalize({ tracking: 'whatever' }).tracking, TRACKING.ALL);
    assert.equal(normalize({ working_with: 'approvals' }).working_with, WORK_WITH.APPROVALS);
    assert.equal(normalize({ working_with: 'whatever' }).working_with, WORK_WITH.UPVOTES);
});

test('normalize only keeps hex colors, so they cannot smuggle CSS in', () => {
    const settings = normalize({
        colors: { actions: '#123abc', wait: 'red; background: url(//evil)', done: null }
    });

    assert.equal(settings.colors.actions, '#123abc');
    assert.equal(settings.colors.wait, DEFAULTS.colors.wait);
    assert.equal(settings.colors.done, DEFAULTS.colors.done);
});
