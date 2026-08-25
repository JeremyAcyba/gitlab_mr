/**
 * Reviews one merge request: gathers what the API knows about it, asks
 * status.js for a verdict and hands it over to decorate.js.
 */
(function (root) {
    'use strict';

    const { TRACKING } = root.GitlabMrTools.settings;
    const { computeStatus, hasParticipated } = root.GitlabMrTools.status;
    const { decorate, dim } = root.GitlabMrTools.decorate;

    /** How many 👍 make a merge request ready to be merged. */
    const UPVOTES_NEEDED = 2;

    /**
     * Has the merge request gathered what it needs to be merged? A single
     * thumbs down is enough to hold it back, however many thumbs up it has.
     *
     * @param {object} mergeRequest
     * @returns {boolean}
     */
    function isApproved(mergeRequest) {
        return mergeRequest.upvotes >= UPVOTES_NEEDED && mergeRequest.downvotes === 0;
    }

    /** @returns {Promise<boolean>} did I put a thumbs up on it? */
    async function hasUpvoted(api, project, mergeRequest, username) {
        const awards = await api.listAwardEmoji(project, mergeRequest.iid);
        return (
            Array.isArray(awards) &&
            awards.some((award) => award.name === 'thumbsup' && award.user?.username === username)
        );
    }

    /**
     * @param {object} api
     * @param {string|number} project numeric id or full path.
     * @param {object} mergeRequest as returned by the merge requests endpoint.
     * @param {{username: string, tracking: string, colors: object}} context
     * @returns {Promise<void>}
     */
    async function reviewMergeRequest(api, project, mergeRequest, context) {
        const isMine = mergeRequest.author?.username === context.username;

        if (!isMine && context.tracking === TRACKING.NOT_MINE) {
            dim(mergeRequest.id);
            return;
        }

        // The award emoji only matter when reviewing somebody else's work.
        const [upvoted, discussions] = await Promise.all([
            isMine ? Promise.resolve(false) : hasUpvoted(api, project, mergeRequest, context.username),
            api.listDiscussions(project, mergeRequest.iid)
        ]);

        if (
            !isMine &&
            context.tracking === TRACKING.NOT_MINE_PARTICIPATE &&
            !hasParticipated(discussions, context.username)
        ) {
            dim(mergeRequest.id);
            return;
        }

        const result = computeStatus(discussions, {
            username: context.username,
            isMine,
            isApproved: isApproved(mergeRequest),
            hasUpvoted: upvoted
        });

        decorate(mergeRequest.id, result, context.colors);
    }

    /**
     * Reviews a batch of merge requests. One failing merge request must not
     * take the whole listing down with it.
     *
     * @returns {Promise<void>}
     */
    async function reviewAll(api, context, entries) {
        const results = await Promise.allSettled(
            entries.map(({ project, mergeRequest }) =>
                reviewMergeRequest(api, project, mergeRequest, context)
            )
        );

        for (const result of results) {
            if (result.status === 'rejected') {
                console.warn('[gitlab-mr-tools] could not review a merge request:', result.reason);
            }
        }
    }

    root.GitlabMrTools.review = { reviewMergeRequest, reviewAll, isApproved, UPVOTES_NEEDED };
})(typeof globalThis !== 'undefined' ? globalThis : window);
