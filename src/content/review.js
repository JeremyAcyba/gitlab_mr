/**
 * Reviews one merge request: gathers what the API knows about it, asks
 * status.js for a verdict and hands it over to decorate.js.
 */
(function (root) {
    'use strict';

    const { TRACKING, WORK_WITH } = root.GitlabMrTools.settings;
    const { computeStatus, hasParticipated } = root.GitlabMrTools.status;
    const { decorate, dim } = root.GitlabMrTools.decorate;

    /**
     * Has the merge request gathered what it needs to be merged? Depending on
     * the user's preference that is either enough thumbs up, or a GitLab
     * approval.
     *
     * @returns {Promise<boolean>}
     */
    async function isApproved(api, project, mergeRequest, settings) {
        if (settings.working_with === WORK_WITH.APPROVALS) {
            const approvals = await api.getApprovals(project, mergeRequest.iid);
            return approvals?.approved === true;
        }

        return mergeRequest.upvotes >= settings.upvotes && mergeRequest.downvotes === 0;
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
     * @param {import('./api.js').GitlabApi} api
     * @param {string|number} project numeric id or full path.
     * @param {object} mergeRequest as returned by the merge requests endpoint.
     * @param {object} settings
     * @returns {Promise<void>}
     */
    async function reviewMergeRequest(api, project, mergeRequest, settings) {
        const isMine = mergeRequest.author?.username === settings.username;

        if (!isMine && settings.tracking === TRACKING.NOT_MINE) {
            dim(mergeRequest.id);
            return;
        }

        // The award emoji only matter when reviewing somebody else's work.
        const [approved, upvoted, discussions] = await Promise.all([
            isApproved(api, project, mergeRequest, settings),
            isMine ? Promise.resolve(false) : hasUpvoted(api, project, mergeRequest, settings.username),
            api.listDiscussions(project, mergeRequest.iid)
        ]);

        if (
            !isMine &&
            settings.tracking === TRACKING.NOT_MINE_PARTICIPATE &&
            !hasParticipated(discussions, settings.username)
        ) {
            dim(mergeRequest.id);
            return;
        }

        const result = computeStatus(discussions, {
            username: settings.username,
            isMine,
            isApproved: approved,
            hasUpvoted: upvoted
        });

        decorate(mergeRequest.id, result, settings.colors);
    }

    /**
     * Reviews a batch of merge requests. One failing merge request must not
     * take the whole listing down with it.
     *
     * @returns {Promise<void>}
     */
    async function reviewAll(api, settings, entries) {
        const results = await Promise.allSettled(
            entries.map(({ project, mergeRequest }) =>
                reviewMergeRequest(api, project, mergeRequest, settings)
            )
        );

        for (const result of results) {
            if (result.status === 'rejected') {
                console.warn('[gitlab-mr-tools] could not review a merge request:', result.reason);
            }
        }
    }

    root.GitlabMrTools.review = { reviewMergeRequest, reviewAll };
})(typeof globalThis !== 'undefined' ? globalThis : window);
