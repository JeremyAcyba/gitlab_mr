'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalize, DEFAULTS, TRACKING } = require('../src/shared/settings.js');

test('normalize falls back to the defaults for anything unusable', () => {
    assert.deepEqual(normalize(undefined), DEFAULTS);
    assert.deepEqual(normalize('nope'), DEFAULTS);
    assert.deepEqual(normalize({ colors: 'nope' }), DEFAULTS);
});

test('normalize only keeps known tracking modes', () => {
    assert.equal(normalize({ tracking: 'not_mine' }).tracking, TRACKING.NOT_MINE);
    assert.equal(normalize({ tracking: 'whatever' }).tracking, TRACKING.ALL);
});

test('normalize only keeps hex colors, so they cannot smuggle CSS in', () => {
    const settings = normalize({
        colors: { actions: '#123abc', wait: 'red; background: url(//evil)', done: null }
    });

    assert.equal(settings.colors.actions, '#123abc');
    assert.equal(settings.colors.wait, DEFAULTS.colors.wait);
    assert.equal(settings.colors.done, DEFAULTS.colors.done);
});

test('normalize drops the keys older versions used to store', () => {
    const settings = normalize({
        username: 'jeremy',
        url: 'https://gitlab.com',
        working_with: 'approvals',
        upvotes: 5,
        tracking: TRACKING.NOT_MINE
    });

    assert.deepEqual(Object.keys(settings).sort(), ['colors', 'tracking']);
    assert.equal(settings.tracking, TRACKING.NOT_MINE);
});
