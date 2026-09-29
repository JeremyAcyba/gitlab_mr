/**
 * Pure decision logic: given the discussions of a merge request and who I am,
 * decide whether I have something to do.
 *
 * No DOM, no network, no globals in here — this is the part that is unit
 * tested (see test/status.test.js).
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
     * A code suggestion in a note body. GitLab renders these as a patch the
     * author can apply in one click, which is what makes them different from a
     * plain comment: once posted, there is nothing left for the reviewer to do.
     */
    const SUGGESTION_FENCE = /^[ \t]*(?:```|~~~)suggestion\b/m;

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

    /** @returns {boolean} true when the note is (or ends with) a code suggestion. */
    function isSuggestion(note) {
        return Boolean(note) && typeof note.body === 'string' && SUGGESTION_FENCE.test(note.body);
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

    /** @returns {object[][]} the resolvable threads still open. */
    function openThreads(discussions) {
        return resolvableThreads(discussions).filter((notes) => !notes[0].resolved);
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
     *  - somebody spoke last in an open thread     -> I owe them an answer
     *  - enough thumbs up and nothing left open    -> I can merge
     *  - anything else                             -> the ball is not in my court
     *
     * Note that gathering the thumbs up is not enough on its own: an open
     * thread I answered last still belongs to its reviewer, not to me.
     *
     * @param {object[]} discussions
     * @param {{username: string, isApproved: boolean}} context
     * @returns {{status: string, message: string}}
     */
    function computeAuthorStatus(discussions, { username, isApproved }) {
        const open = openThreads(discussions);
        const owesAnAnswer = open.some((notes) => !isAuthoredBy(lastHumanNote(notes), username));
        const canBeMerged = isApproved && open.length === 0;

        return {
            status: owesAnAnswer || canBeMerged ? STATUS.ACTIONS : STATUS.WAIT,
            message: canBeMerged ? 'Can be merged!' : ''
        };
    }

    /**
     * Status of a merge request opened by somebody else.
     *
     * Only the threads I opened myself count here: a thread somebody else
     * started is their business until I make it mine.
     *
     * @param {object[]} discussions
     * @param {{username: string, authorUsername: string, hasUpvoted: boolean, hasDownvoted: boolean}} context
     * @returns {{status: string, message: string}}
     */
    function computeReviewerStatus(discussions, { username, authorUsername, hasUpvoted, hasDownvoted }) {
        const myOpenThreads = openThreads(discussions).filter((notes) => isAuthoredBy(notes[0], username));

        if (!hasUpvoted && !hasDownvoted) {
            // I haven't given my verdict yet. The only thing that can excuse me
            // is an open thread of mine the author has not answered: until they
            // do, there is nothing for me to review.
            const waitingOnTheAuthor = myOpenThreads.some(
                (notes) => !isAuthoredBy(lastHumanNote(notes), authorUsername)
            );

            return { status: waitingOnTheAuthor ? STATUS.WAIT : STATUS.ACTIONS, message: '' };
        }

        if (myOpenThreads.length === 0) {
            // A thumbs down that leaves nothing open explains nothing: I owe the
            // author either a reason or a change of heart.
            return { status: hasDownvoted ? STATUS.ACTIONS : STATUS.DONE, message: '' };
        }

        // I voted but left threads open. Only the last message of each decides:
        // a code suggestion is something the author applies on their own, a
        // conversation is something I still have to carry.
        const stillOnMe = myOpenThreads.some((notes) => !isSuggestion(lastHumanNote(notes)));

        return { status: stillOnMe ? STATUS.ACTIONS : STATUS.DONE, message: '' };
    }

    /**
     * @param {object[]} discussions
     * @param {object} context
     * @returns {{status: string, message: string}}
     */
    function computeStatus(discussions, context) {
        // A draft is the author's to finish; reviewers have nothing to do until
        // it is marked ready, whatever the threads say.
        if (context.isDraft) {
            return { status: context.isMine ? STATUS.ACTIONS : STATUS.WAIT, message: '' };
        }

        return context.isMine
            ? computeAuthorStatus(discussions, context)
            : computeReviewerStatus(discussions, context);
    }

    const statusModule = {
        STATUS,
        lastHumanNote,
        isSuggestion,
        resolvableThreads,
        openThreads,
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
