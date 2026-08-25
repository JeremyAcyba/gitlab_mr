/**
 * Pure decision logic: given the discussions of a merge request and who I am,
 * decide whether I have something to do.
 *
 * No DOM, no network, no globals in here — this is the part that is unit
 * tested (see test/status.test.mjs).
 */
(function (root) {
    'use strict';

    /** @enum {string} */
    const STATUS = {
        ACTIONS: 'actions',
        WAIT: 'wait',
        DONE: 'done'
    };

    /**
     * The last note actually written by a human. GitLab appends system notes
     * ("changed this line in version 2 of the diff") to discussions, and those
     * must not count as "somebody answered me".
     *
     * @param {object[]} notes
     * @returns {object|null}
     */
    function lastHumanNote(notes) {
        if (!Array.isArray(notes) || notes.length === 0) {
            return null;
        }

        for (let i = notes.length - 1; i >= 0; i--) {
            if (!notes[i].system) {
                return notes[i];
            }
        }

        return notes[notes.length - 1];
    }

    /** @returns {boolean} */
    function isAuthoredBy(note, username) {
        return Boolean(note) && note.author?.username === username;
    }

    /**
     * Discussions that can be resolved are the only ones carrying a "do I have
     * something to do" signal; plain comments are ignored.
     *
     * @param {object[]} discussions
     * @returns {object[][]} the notes of each resolvable discussion.
     */
    function resolvableThreads(discussions) {
        if (!Array.isArray(discussions)) {
            return [];
        }

        return discussions
            .map((discussion) => discussion?.notes)
            .filter((notes) => Array.isArray(notes) && notes.length > 0 && Boolean(notes[0].resolvable));
    }

    /** @returns {boolean} true when `username` wrote at least one note. */
    function hasParticipated(discussions, username) {
        if (!Array.isArray(discussions)) {
            return false;
        }

        return discussions.some((discussion) =>
            Array.isArray(discussion?.notes)
                ? discussion.notes.some((note) => isAuthoredBy(note, username))
                : false
        );
    }

    /**
     * Status of a merge request I opened.
     *
     * Actions needed when somebody answered one of my unresolved threads, or
     * when the merge request gathered its approvals and is ready to be merged.
     *
     * @param {object[]} discussions
     * @param {{username: string, isApproved: boolean}} context
     * @returns {{status: string, message: string}}
     */
    function computeAuthorStatus(discussions, { username, isApproved }) {
        let hasUnresolved = false;
        let needsAnswer = false;

        for (const notes of resolvableThreads(discussions)) {
            if (notes[0].resolved) {
                continue;
            }

            hasUnresolved = true;
            if (!isAuthoredBy(lastHumanNote(notes), username)) {
                needsAnswer = true;
            }
        }

        return {
            status: needsAnswer || isApproved ? STATUS.ACTIONS : STATUS.WAIT,
            message: isApproved && !hasUnresolved ? 'Can be merged!' : ''
        };
    }

    /**
     * Status of a merge request opened by somebody else.
     *
     * @param {object[]} discussions
     * @param {{username: string, isApproved: boolean, hasUpvoted: boolean}} context
     * @returns {{status: string, message: string}}
     */
    function computeReviewerStatus(discussions, { username, isApproved, hasUpvoted }) {
        // Threads I opened.
        let mine = 0;
        let mineResolved = 0;
        // Threads I opened that were answered: my turn again.
        let mineAwaitingMe = 0;
        // Threads where I spoke last: the ball is in the author's court.
        let awaitingAuthor = 0;

        for (const notes of resolvableThreads(discussions)) {
            const iOpenedIt = isAuthoredBy(notes[0], username);
            const iSpokeLast = isAuthoredBy(lastHumanNote(notes), username);

            if (iOpenedIt) {
                mine++;
                if (notes[0].resolved) {
                    mineResolved++;
                } else if (!iSpokeLast) {
                    mineAwaitingMe++;
                } else {
                    awaitingAuthor++;
                }
            } else if (!notes[0].resolved && iSpokeLast) {
                awaitingAuthor++;
            }
        }

        // I already gave my green light: only my own leftover threads matter.
        if (hasUpvoted || isApproved) {
            return {
                status: mineResolved === mine ? STATUS.DONE : STATUS.ACTIONS,
                message: ''
            };
        }

        // I never reviewed it, or somebody answered a thread of mine.
        if (mine === 0 || (mineResolved === mine && awaitingAuthor === 0) || mineAwaitingMe > 0) {
            return { status: STATUS.ACTIONS, message: '' };
        }

        if (awaitingAuthor > 0) {
            return { status: STATUS.WAIT, message: '' };
        }

        return { status: STATUS.DONE, message: '' };
    }

    /**
     * @param {object[]} discussions
     * @param {{username: string, isMine: boolean, isApproved: boolean, hasUpvoted: boolean}} context
     * @returns {{status: string, message: string}}
     */
    function computeStatus(discussions, context) {
        return context.isMine
            ? computeAuthorStatus(discussions, context)
            : computeReviewerStatus(discussions, context);
    }

    const statusModule = {
        STATUS,
        lastHumanNote,
        resolvableThreads,
        hasParticipated,
        computeAuthorStatus,
        computeReviewerStatus,
        computeStatus
    };

    root.GitlabMrTools = root.GitlabMrTools || {};
    root.GitlabMrTools.status = statusModule;

    /* Exported for the unit tests; unused inside the browser. */
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = statusModule;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
