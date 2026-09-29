'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
    STATUS,
    lastHumanNote,
    isSuggestion,
    hasParticipated,
    computeAuthorStatus,
    computeReviewerStatus,
    computeStatus
} = require('../src/content/status.js');

/** review.js registers itself on a namespace, so load it the way Chrome does. */
function loadReviewModule() {
    const sandbox = { console };
    sandbox.globalThis = sandbox;
    sandbox.GitlabMrTools = {
        settings: require('../src/shared/settings.js'),
        status: require('../src/content/status.js'),
        decorate: { decorate() {}, dim() {} }
    };
    vm.createContext(sandbox);

    const file = path.join(__dirname, '..', 'src', 'content', 'review.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: 'review.js' });

    return sandbox.GitlabMrTools.review;
}

const ME = 'jeremy';
const AUTHOR = 'alice';
const THIRD_PARTY = 'bob';

/** @returns {object} a note as the GitLab API returns it. */
function note(username, { resolvable = true, resolved = false, system = false, body = 'hello' } = {}) {
    return { author: { username }, resolvable, resolved, system, body };
}

/** @returns {object} a note carrying a code suggestion. */
function suggestion(username, options = {}) {
    return note(username, { ...options, body: 'Try this:\n\n```suggestion:-0+0\nconst a = 1;\n```' });
}

/** @returns {object} a discussion wrapping the given notes. */
function thread(...notes) {
    return { notes };
}

/** Marks every note of a thread as resolved. */
function resolved(...notes) {
    return { notes: notes.map((n) => ({ ...n, resolved: true })) };
}

function asAuthor(discussions, { isApproved = false } = {}) {
    return computeAuthorStatus(discussions, { username: AUTHOR, isApproved });
}

function asReviewer(discussions, { hasUpvoted = false, hasDownvoted = false } = {}) {
    return computeReviewerStatus(discussions, {
        username: ME,
        authorUsername: AUTHOR,
        hasUpvoted,
        hasDownvoted
    });
}

/* ------------------------------------------------------------------ helpers */

test('lastHumanNote skips the system notes GitLab appends', () => {
    const human = note(AUTHOR);
    assert.equal(lastHumanNote([note(ME), human, note(ME, { system: true })]), human);
});

test('lastHumanNote survives a thread made only of system notes', () => {
    const only = note(ME, { system: true });
    assert.equal(lastHumanNote([only]), only);
    assert.equal(lastHumanNote([]), null);
    assert.equal(lastHumanNote(undefined), null);
});

test('isSuggestion recognises the fenced suggestion block', () => {
    assert.equal(isSuggestion(suggestion(ME)), true);
    assert.equal(isSuggestion(note(ME, { body: '~~~suggestion\nconst a = 1;\n~~~' })), true);
    assert.equal(isSuggestion(note(ME, { body: '```js\nconst a = 1;\n```' })), false);
    assert.equal(isSuggestion(note(ME, { body: 'you should suggest something' })), false);
    assert.equal(isSuggestion(null), false);
});

test('non resolvable discussions are ignored', () => {
    const discussions = [thread(note(ME, { resolvable: false }))];
    assert.equal(asAuthor(discussions).status, STATUS.WAIT);
    assert.equal(asReviewer(discussions).status, STATUS.ACTIONS);
});

/* ------------------------------------------------------ author of the merge request */

test('author: somebody spoke last in an open thread, I owe them an answer', () => {
    assert.equal(asAuthor([thread(note(ME), note(THIRD_PARTY))]).status, STATUS.ACTIONS);
});

test('author: a thread opened by a reviewer and left unanswered', () => {
    assert.equal(asAuthor([thread(note(ME))]).status, STATUS.ACTIONS);
});

test('author: once I answered every open thread, I am waiting', () => {
    assert.equal(asAuthor([thread(note(ME), note(AUTHOR))]).status, STATUS.WAIT);
});

test('author: a system note after my answer does not look like a reply', () => {
    const discussions = [thread(note(ME), note(AUTHOR), note(ME, { system: true }))];
    assert.equal(asAuthor(discussions).status, STATUS.WAIT);
});

test('author: no thread and not enough thumbs, nothing to do but wait', () => {
    assert.equal(asAuthor([]).status, STATUS.WAIT);
    assert.equal(asAuthor([resolved(note(ME), note(AUTHOR))]).status, STATUS.WAIT);
});

test('author: enough thumbs and nothing left open, it can be merged', () => {
    const result = asAuthor([resolved(note(ME), note(AUTHOR))], { isApproved: true });

    assert.equal(result.status, STATUS.ACTIONS);
    assert.equal(result.message, 'Can be merged!');
});

test('author: enough thumbs but an open thread I answered last is still a wait', () => {
    // The thumbs are in, yet that thread belongs to its reviewer until they
    // resolve it: nothing for me to do, and nothing to merge either.
    const result = asAuthor([thread(note(ME), note(AUTHOR))], { isApproved: true });

    assert.equal(result.status, STATUS.WAIT);
    assert.equal(result.message, '');
});

test('author: enough thumbs but an unanswered open thread is on me', () => {
    const result = asAuthor([thread(note(ME), note(THIRD_PARTY))], { isApproved: true });

    assert.equal(result.status, STATUS.ACTIONS);
    assert.equal(result.message, '');
});

/* ------------------------------------------------------------------ reviewer */

test('reviewer: a merge request I never looked at needs my attention', () => {
    assert.equal(asReviewer([]).status, STATUS.ACTIONS);
});

test('reviewer: I reviewed and resolved everything but never voted', () => {
    assert.equal(asReviewer([resolved(note(ME), note(AUTHOR))]).status, STATUS.ACTIONS);
});

test('reviewer: my open thread, the author answered last, back to me', () => {
    assert.equal(asReviewer([thread(note(ME), note(AUTHOR))]).status, STATUS.ACTIONS);
});

test('reviewer: my open thread where I spoke last, waiting on the author', () => {
    assert.equal(asReviewer([thread(note(ME), note(AUTHOR), note(ME))]).status, STATUS.WAIT);
});

test('reviewer: a third party spoke last in my open thread, still waiting on the author', () => {
    assert.equal(asReviewer([thread(note(ME), note(THIRD_PARTY))]).status, STATUS.WAIT);
});

test('reviewer: threads I did not open are none of my business', () => {
    // Even one I took part in and spoke last in.
    const discussions = [thread(note(THIRD_PARTY), note(ME))];
    assert.equal(asReviewer(discussions).status, STATUS.ACTIONS);
});

test('reviewer: upvoted with all my threads resolved is done', () => {
    const discussions = [resolved(note(ME), note(AUTHOR)), thread(note(THIRD_PARTY))];
    assert.equal(asReviewer(discussions, { hasUpvoted: true }).status, STATUS.DONE);
});

test('reviewer: a thumbs down explaining nothing leaves me something to do', () => {
    // Either I justify the rejection in a thread, or I change my vote.
    assert.equal(asReviewer([], { hasDownvoted: true }).status, STATUS.ACTIONS);
});

test('reviewer: voted, but an open conversation of mine is still on me', () => {
    const discussions = [thread(note(ME), note(AUTHOR))];

    assert.equal(asReviewer(discussions, { hasUpvoted: true }).status, STATUS.ACTIONS);
    assert.equal(asReviewer(discussions, { hasDownvoted: true }).status, STATUS.ACTIONS);
});

test('reviewer: voted, and my open threads all end on a code suggestion', () => {
    // The author applies them on their own: nothing left for me.
    const discussions = [thread(note(ME), suggestion(ME)), resolved(note(ME))];
    assert.equal(asReviewer(discussions, { hasUpvoted: true }).status, STATUS.DONE);
});

test('reviewer: one conversation among the suggestions is enough to call me back', () => {
    const discussions = [thread(suggestion(ME)), thread(note(ME), note(AUTHOR))];
    assert.equal(asReviewer(discussions, { hasUpvoted: true }).status, STATUS.ACTIONS);
});

test('reviewer: only the last message of a thread decides', () => {
    // Opened with a suggestion, but the conversation moved on since.
    const openedWithSuggestion = [thread(suggestion(ME), note(AUTHOR))];
    assert.equal(asReviewer(openedWithSuggestion, { hasUpvoted: true }).status, STATUS.ACTIONS);

    // Opened as a conversation, closed with a suggestion.
    const endedOnSuggestion = [thread(note(ME), note(AUTHOR), suggestion(ME))];
    assert.equal(asReviewer(endedOnSuggestion, { hasUpvoted: true }).status, STATUS.DONE);
});

/* ------------------------------------------------------------------- tracking */

test('hasParticipated looks at every note, resolvable or not', () => {
    assert.equal(hasParticipated([thread(note(AUTHOR), note(ME))], ME), true);
    assert.equal(hasParticipated([thread(note(AUTHOR))], ME), false);
    assert.equal(hasParticipated(undefined, ME), false);
});

/* ---------------------------------------------------------------- merge threshold */

test('the merge threshold is two upvotes and no downvote', () => {
    const { isApproved, UPVOTES_NEEDED } = loadReviewModule();

    assert.equal(UPVOTES_NEEDED, 2);
    assert.equal(isApproved({ upvotes: 2, downvotes: 0 }), true);
    assert.equal(isApproved({ upvotes: 3, downvotes: 0 }), true);
    assert.equal(isApproved({ upvotes: 1, downvotes: 0 }), false);
    // A single thumbs down holds it back, however many thumbs up it has.
    assert.equal(isApproved({ upvotes: 5, downvotes: 1 }), false);
});

/* -------------------------------------------------------------------- drafts */

test('a draft calls its author back and leaves the reviewers waiting', () => {
    const discussions = [thread(note(AUTHOR), note(ME))];

    assert.equal(computeStatus(discussions, { username: AUTHOR, isMine: true, isDraft: true, isApproved: true }).status, STATUS.ACTIONS);
    assert.equal(
        computeStatus(discussions, { username: ME, authorUsername: AUTHOR, isMine: false, isDraft: true, hasUpvoted: false, hasDownvoted: false }).status,
        STATUS.WAIT
    );
});
