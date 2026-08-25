'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    STATUS,
    lastHumanNote,
    hasParticipated,
    computeAuthorStatus,
    computeReviewerStatus
} = require('../src/content/status.js');

const ME = 'jeremy';
const OTHER = 'alice';

/** @returns {object} a note as the GitLab API returns it. */
function note(username, { resolvable = true, resolved = false, system = false } = {}) {
    return { author: { username }, resolvable, resolved, system };
}

/** @returns {object} a discussion wrapping the given notes. */
function thread(...notes) {
    return { notes };
}

test('lastHumanNote skips the system notes GitLab appends', () => {
    const human = note(OTHER);
    assert.equal(lastHumanNote([note(ME), human, note(ME, { system: true })]), human);
});

test('lastHumanNote survives a thread made only of system notes', () => {
    const only = note(ME, { system: true });
    assert.equal(lastHumanNote([only]), only);
    assert.equal(lastHumanNote([]), null);
    assert.equal(lastHumanNote(undefined), null);
});

test('non resolvable discussions are ignored', () => {
    const discussions = [thread(note(OTHER, { resolvable: false }))];
    assert.equal(computeAuthorStatus(discussions, { username: ME, isApproved: false }).status, STATUS.WAIT);
});

test('author: an unanswered review comment means actions needed', () => {
    const discussions = [thread(note(OTHER), note(OTHER))];
    const result = computeAuthorStatus(discussions, { username: ME, isApproved: false });

    assert.equal(result.status, STATUS.ACTIONS);
    assert.equal(result.message, '');
});

test('author: once I answered, the ball is in the reviewer court', () => {
    const discussions = [thread(note(OTHER), note(ME))];
    assert.equal(computeAuthorStatus(discussions, { username: ME, isApproved: false }).status, STATUS.WAIT);
});

test('author: a system note after my answer does not look like a reply', () => {
    const discussions = [thread(note(OTHER), note(ME), note(OTHER, { system: true }))];
    assert.equal(computeAuthorStatus(discussions, { username: ME, isApproved: false }).status, STATUS.WAIT);
});

test('author: approved with everything resolved can be merged', () => {
    const discussions = [thread(note(OTHER, { resolved: true }))];
    const result = computeAuthorStatus(discussions, { username: ME, isApproved: true });

    assert.equal(result.status, STATUS.ACTIONS);
    assert.equal(result.message, 'Can be merged!');
});

test('author: approved but a thread is still open shows no merge message', () => {
    const discussions = [thread(note(OTHER), note(ME))];
    const result = computeAuthorStatus(discussions, { username: ME, isApproved: true });

    assert.equal(result.status, STATUS.ACTIONS);
    assert.equal(result.message, '');
});

test('reviewer: a merge request I never reviewed needs my attention', () => {
    const result = computeReviewerStatus([], { username: ME, isApproved: false, hasUpvoted: false });
    assert.equal(result.status, STATUS.ACTIONS);
});

test('reviewer: waiting for the author to answer my open thread', () => {
    const discussions = [thread(note(ME), note(OTHER), note(ME))];
    const result = computeReviewerStatus(discussions, { username: ME, isApproved: false, hasUpvoted: false });

    assert.equal(result.status, STATUS.WAIT);
});

test('reviewer: the author answered my open thread, my turn again', () => {
    const discussions = [thread(note(ME), note(OTHER))];
    const result = computeReviewerStatus(discussions, { username: ME, isApproved: false, hasUpvoted: false });

    assert.equal(result.status, STATUS.ACTIONS);
});

test('reviewer: upvoted with all my threads resolved is done', () => {
    const discussions = [thread(note(ME, { resolved: true }), note(OTHER))];
    const result = computeReviewerStatus(discussions, { username: ME, isApproved: false, hasUpvoted: true });

    assert.equal(result.status, STATUS.DONE);
});

test('reviewer: upvoted but one of my threads is still open is not done', () => {
    const discussions = [thread(note(ME), note(OTHER))];
    const result = computeReviewerStatus(discussions, { username: ME, isApproved: false, hasUpvoted: true });

    assert.equal(result.status, STATUS.ACTIONS);
});

test('reviewer: I reviewed, everything is resolved, but I never upvoted', () => {
    const discussions = [thread(note(ME, { resolved: true }), note(OTHER))];
    const result = computeReviewerStatus(discussions, { username: ME, isApproved: false, hasUpvoted: false });

    assert.equal(result.status, STATUS.ACTIONS);
});

test('reviewer: I answered somebody else open thread', () => {
    const discussions = [thread(note(OTHER), note(ME))];
    const result = computeReviewerStatus(discussions, { username: ME, isApproved: false, hasUpvoted: false });

    assert.equal(result.status, STATUS.ACTIONS);
});

test('hasParticipated looks at every note, resolvable or not', () => {
    assert.equal(hasParticipated([thread(note(OTHER), note(ME))], ME), true);
    assert.equal(hasParticipated([thread(note(OTHER))], ME), false);
    assert.equal(hasParticipated(undefined, ME), false);
});
