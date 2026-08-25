/**
 * Entry point of the content script: figures out whether we are on the
 * configured GitLab instance, on which kind of page, and starts the right
 * module.
 */
(function (root) {
    'use strict';

    const { settings: settingsModule, api: apiModule, pages, threads, dom } = root.GitlabMrTools;

    /** Selectors that tell us the page is a GitLab one. */
    const GITLAB_MARKERS = [
        '.tanuki-logo',
        '[data-testid="tanuki-logo"]',
        'meta[content="GitLab"][property="og:site_name"]',
        'body[data-page]'
    ];

    /** Selectors GitLab has used for the link to the current user's profile. */
    const PROFILE_LINK_SELECTORS = [
        '[data-track-label="user_profile"]',
        '[data-testid="user-profile-link"]',
        '.js-user-profile-link'
    ];

    const LOG_PREFIX = '[gitlab-mr-tools]';

    function isGitlabPage() {
        return GITLAB_MARKERS.some((selector) => document.querySelector(selector) !== null);
    }

    /**
     * The extension can bootstrap itself from the logged-in account rather than
     * asking the user to type their username and instance URL.
     *
     * @returns {{username: string, url: string}|null}
     */
    function detectAccount() {
        for (const selector of PROFILE_LINK_SELECTORS) {
            const link = document.querySelector(selector);
            const href = link?.getAttribute('href');
            if (!href) {
                continue;
            }

            const username = href.split('/').filter(Boolean).pop();
            if (username) {
                return { username, url: window.location.origin };
            }
        }

        return null;
    }

    /**
     * Only run on the instance the user configured. A substring check would let
     * `https://example.com/?next=https://gitlab.com` through, which would leak
     * the fact that we are looking at GitLab data to an unrelated site.
     *
     * @param {string} configuredUrl normalized `origin` + optional base path.
     * @returns {string|null} the base path when we are on the right instance.
     */
    function matchInstance(configuredUrl) {
        const configured = settingsModule.parseGitlabUrl(configuredUrl);
        if (!configured || configured.origin !== window.location.origin) {
            return null;
        }

        const basePath = configured.pathname === '/' ? '' : configured.pathname.replace(/\/+$/, '');
        if (basePath && !window.location.pathname.startsWith(`${basePath}/`)) {
            return null;
        }

        return basePath;
    }

    /**
     * @param {string} basePath
     * @returns {{kind: string, project?: string}}
     */
    function detectPage(basePath) {
        let path = window.location.pathname;
        if (basePath && path.startsWith(basePath)) {
            path = path.slice(basePath.length) || '/';
        }

        // Dashboard and group listings mix merge requests from several projects.
        if (
            (path.startsWith('/dashboard/') || path.startsWith('/groups/')) &&
            path.includes('/merge_requests')
        ) {
            return { kind: 'dashboard' };
        }

        const projectMatch = path.match(/^\/(.+?)\/-\/merge_requests(\/(\d+))?/);
        if (!projectMatch) {
            return { kind: 'none' };
        }

        if (projectMatch[3]) {
            return { kind: 'merge-request' };
        }

        // The body attribute is authoritative; the path is the fallback for the
        // pages where GitLab stopped rendering it.
        const project = document.querySelector('body[data-project-id]')?.dataset.projectId;
        return { kind: 'project-listing', project: project || projectMatch[1] };
    }

    /**
     * @param {object} settings
     * @param {string} basePath
     * @returns {Promise<void>}
     */
    async function runForCurrentPage(settings, basePath) {
        const page = detectPage(basePath);
        if (page.kind === 'none') {
            return;
        }

        if (page.kind === 'merge-request') {
            await threads.run();
            return;
        }

        const api = new apiModule.GitlabApi(settings.url);
        if (page.kind === 'dashboard') {
            await pages.runDashboardListing(api, settings, basePath);
        } else {
            await pages.runProjectListing(api, settings, page.project);
        }
    }

    async function bootstrap() {
        if (!isGitlabPage()) {
            return;
        }

        let settings = await settingsModule.load();

        if (!settingsModule.isConfigured(settings)) {
            const account = detectAccount();
            if (!account) {
                return;
            }
            settings = await settingsModule.save({ ...settings, ...account });
        }

        const basePath = matchInstance(settings.url);
        if (basePath === null) {
            return;
        }

        const run = () => {
            runForCurrentPage(settings, basePath).catch((error) => {
                console.warn(`${LOG_PREFIX} could not decorate the page:`, error);
            });
        };

        run();
        // GitLab navigates without reloading, so the listing we decorated can be
        // replaced by another one at any time.
        dom.onNavigation(run);
    }

    bootstrap().catch((error) => {
        console.warn(`${LOG_PREFIX} startup failed:`, error);
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
