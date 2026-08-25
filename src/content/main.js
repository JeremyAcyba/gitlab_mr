/**
 * Entry point of the content script: decides whether the current page is a
 * GitLab merge request page worth decorating, resolves which instance and
 * which user we are dealing with, then starts the right module.
 */
(function (root) {
    'use strict';

    const { settings: settingsModule, instance, pages, threads, dom } = root.GitlabMrTools;

    /**
     * Cheapest possible gate: every page we act on has this in its path, so
     * the extension does nothing at all on the rest of the web.
     */
    const PATH_GATE = '/merge_requests';

    /** Selectors that tell us the page is a GitLab one. */
    const GITLAB_MARKERS = [
        '.tanuki-logo',
        '[data-testid="tanuki-logo"]',
        'body[data-page]',
        'meta[content="GitLab"][property="og:site_name"]',
        'link[rel="search"][href*="opensearch"]'
    ];

    const LOG_PREFIX = '[gitlab-mr-tools]';

    function isGitlabPage() {
        return GITLAB_MARKERS.some((selector) => document.querySelector(selector) !== null);
    }

    /**
     * Which kind of page are we on? Deliberately based on landmarks that hold
     * whatever base path GitLab is served under, so this needs no configuration
     * and no instance lookup.
     *
     * @returns {{kind: 'none'|'merge-request'|'dashboard'|'project-listing'}}
     */
    function detectPage() {
        const path = window.location.pathname;

        if (!path.includes(PATH_GATE)) {
            return { kind: 'none' };
        }

        // A single merge request: `/<project>/-/merge_requests/42`.
        if (/\/-\/merge_requests\/\d+/.test(path)) {
            return { kind: 'merge-request' };
        }

        // Dashboard and group listings mix merge requests from several projects.
        if (path.includes('/dashboard/merge_requests') || /\/groups\/.+\/merge_requests/.test(path)) {
            return { kind: 'dashboard' };
        }

        if (path.includes('/-/merge_requests')) {
            return { kind: 'project-listing' };
        }

        return { kind: 'none' };
    }

    /**
     * The project a listing belongs to. GitLab puts it on <body>; the path is
     * the fallback for the pages where it stopped doing so.
     *
     * @param {string} basePath
     * @returns {string|null}
     */
    function currentProject(basePath) {
        const fromBody = document.querySelector('body[data-project-id]')?.dataset.projectId;
        if (fromBody) {
            return fromBody;
        }

        let path = window.location.pathname;
        if (basePath && path.startsWith(basePath)) {
            path = path.slice(basePath.length);
        }

        const match = path.match(/^\/(.+?)\/-\/merge_requests/);
        return match ? match[1] : null;
    }

    /**
     * Resolved once per page load and kept in memory: in-app navigation must
     * not re-probe the API, and a cache that outlives the page would go stale
     * the moment the user switches account.
     */
    let resolvedInstance;

    function getInstance() {
        resolvedInstance = resolvedInstance ?? instance.resolve();
        return resolvedInstance;
    }

    /**
     * @returns {Promise<void>}
     */
    async function runForCurrentPage() {
        const page = detectPage();
        if (page.kind === 'none') {
            return;
        }

        // Collapsing threads is pure DOM work: no API call, no user needed.
        if (page.kind === 'merge-request') {
            await threads.run();
            return;
        }

        const [gitlab, settings] = await Promise.all([getInstance(), settingsModule.load()]);
        if (!gitlab) {
            return;
        }

        const context = { ...settings, username: gitlab.username };

        if (page.kind === 'dashboard') {
            await pages.runDashboardListing(gitlab.api, context, gitlab.basePath);
            return;
        }

        const project = currentProject(gitlab.basePath);
        if (project) {
            await pages.runProjectListing(gitlab.api, context, project);
        }
    }

    function bootstrap() {
        if (!isGitlabPage()) {
            return;
        }

        const run = () => {
            runForCurrentPage().catch((error) => {
                console.warn(`${LOG_PREFIX} could not decorate the page:`, error);
            });
        };

        run();
        // GitLab navigates without reloading, so the listing we decorated can be
        // replaced by another one at any time.
        dom.onNavigation(run);
    }

    bootstrap();
})(typeof globalThis !== 'undefined' ? globalThis : window);
