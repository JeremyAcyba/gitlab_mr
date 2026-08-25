/**
 * The two listings the extension decorates:
 *  - a project's own merge request listing, where the project id is on <body>;
 *  - the dashboard / group listings, which mix merge requests from any number
 *    of projects and therefore have to be read from the DOM.
 */
(function (root) {
    'use strict';

    const { reviewAll } = root.GitlabMrTools.review;
    const { waitForElements, queryFirstMatching } = root.GitlabMrTools.dom;

    /** A decorated row always carries the merge request global id. */
    const ROW_SELECTOR = 'li.merge-request, [id^="issuable_"]';

    /** Selectors GitLab has used for the merge request links in a listing. */
    const MR_LINK_SELECTORS = [
        'li.merge-request a.issue-title-text',
        'li.merge-request [data-testid="issuable-title-link"]',
        'li.merge-request .merge-request-title-text a',
        '[data-testid="issuable-title-link"]'
    ];

    /**
     * `/group/subgroup/project/-/merge_requests/42` -> project path + iid.
     * The path is what we feed the API, so two projects sharing the same name
     * in different groups can no longer be mixed up.
     *
     * @param {string} href
     * @param {string} basePath the path GitLab is served under, `''` at root.
     * @returns {{project: string, iid: number}|null}
     */
    function parseMergeRequestHref(href, basePath) {
        let pathname;
        try {
            pathname = new URL(href, window.location.origin).pathname;
        } catch {
            return null;
        }

        if (basePath && pathname.startsWith(`${basePath}/`)) {
            pathname = pathname.slice(basePath.length);
        }

        const match = pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)(?:\/|$)/);
        return match ? { project: match[1], iid: Number(match[2]) } : null;
    }

    /**
     * Project listing: one API call gives us every opened merge request.
     *
     * @param {object} api
     * @param {object} context settings plus the resolved username.
     * @param {string} projectId
     * @returns {Promise<void>}
     */
    async function runProjectListing(api, context, projectId) {
        // The rows are rendered client-side: fetching and waiting at the same
        // time keeps us from decorating a listing that is not there yet.
        const [mergeRequests] = await Promise.all([
            api.listOpenMergeRequests(projectId),
            waitForElements(ROW_SELECTOR)
        ]);

        if (!Array.isArray(mergeRequests)) {
            return;
        }

        await reviewAll(
            api,
            context,
            mergeRequests.map((mergeRequest) => ({ project: projectId, mergeRequest }))
        );
    }

    /**
     * Dashboard and group listings: the merge requests come from many projects,
     * so we read them off the rendered rows and fetch them one by one.
     *
     * @param {object} api
     * @param {object} context settings plus the resolved username.
     * @param {string} basePath
     * @returns {Promise<void>}
     */
    async function runDashboardListing(api, context, basePath) {
        await waitForElements(MR_LINK_SELECTORS.join(', '));

        const seen = new Set();
        const references = [];
        for (const link of queryFirstMatching(MR_LINK_SELECTORS)) {
            const reference = parseMergeRequestHref(link.getAttribute('href') ?? '', basePath);
            if (!reference) {
                continue;
            }

            const key = `${reference.project}!${reference.iid}`;
            if (!seen.has(key)) {
                seen.add(key);
                references.push(reference);
            }
        }

        const fetched = await Promise.allSettled(
            references.map(async ({ project, iid }) => ({
                project,
                mergeRequest: await api.getMergeRequest(project, iid)
            }))
        );

        const entries = [];
        for (const result of fetched) {
            if (result.status === 'fulfilled' && result.value.mergeRequest?.iid) {
                entries.push(result.value);
            } else if (result.status === 'rejected') {
                console.warn('[gitlab-mr-tools] could not load a merge request:', result.reason);
            }
        }

        await reviewAll(api, context, entries);
    }

    root.GitlabMrTools.pages = { runProjectListing, runDashboardListing, parseMergeRequestHref };
})(typeof globalThis !== 'undefined' ? globalThis : window);
