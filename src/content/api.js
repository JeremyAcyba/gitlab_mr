/**
 * Thin wrapper around the GitLab REST API v4.
 *
 * Requests are sent from the content script with the page cookies, which is
 * what makes them work without asking the user for a personal access token.
 * That also means every call is same-origin with the GitLab instance: we never
 * send credentials anywhere else (main.js refuses to run when the page origin
 * is not the configured GitLab origin).
 */
(function (root) {
    'use strict';

    const REQUEST_TIMEOUT_MS = 15000;
    /** GitLab rate-limits us if we fire a hundred requests at once. */
    const MAX_CONCURRENT_REQUESTS = 6;

    class HttpError extends Error {
        constructor(status, url) {
            super(`GitLab API responded ${status} for ${url}`);
            this.name = 'HttpError';
            this.status = status;
        }
    }

    /** Minimal promise pool: runs at most `limit` tasks concurrently. */
    function createLimiter(limit) {
        let active = 0;
        const queue = [];

        const next = () => {
            if (active >= limit || queue.length === 0) {
                return;
            }
            active++;
            const { task, resolve, reject } = queue.shift();
            task()
                .then(resolve, reject)
                .finally(() => {
                    active--;
                    next();
                });
        };

        return (task) =>
            new Promise((resolve, reject) => {
                queue.push({ task, resolve, reject });
                next();
            });
    }

    class GitlabApi {
        /**
         * @param {string} baseUrl normalized instance URL, e.g. `https://gitlab.com`
         */
        constructor(baseUrl) {
            this.apiRoot = `${baseUrl}/api/v4`;
            this.limit = createLimiter(MAX_CONCURRENT_REQUESTS);
        }

        /**
         * @param {string} path API path, already encoded.
         * @param {Record<string, string|number>} [query]
         * @returns {Promise<any>}
         */
        get(path, query = {}) {
            const url = new URL(`${this.apiRoot}${path}`);
            for (const [key, value] of Object.entries(query)) {
                url.searchParams.set(key, String(value));
            }

            return this.limit(async () => {
                const response = await fetch(url, {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
                });

                if (!response.ok) {
                    throw new HttpError(response.status, url.pathname);
                }

                return response.json();
            });
        }

        /**
         * @param {string|number} project numeric id or full path (`group/project`).
         * @returns {string}
         */
        static projectPath(project) {
            return `/projects/${encodeURIComponent(project)}`;
        }

        /**
         * The logged-in user behind the session cookie. Doubles as the probe
         * that tells us whether this origin really is a GitLab instance.
         *
         * @returns {Promise<object>}
         */
        getCurrentUser() {
            return this.get('/user');
        }

        /** @returns {Promise<object[]>} the opened merge requests of a project. */
        listOpenMergeRequests(project) {
            return this.get(`${GitlabApi.projectPath(project)}/merge_requests`, {
                state: 'opened',
                per_page: 100
            });
        }

        /** @returns {Promise<object>} a single merge request, by its iid. */
        getMergeRequest(project, iid) {
            return this.get(`${GitlabApi.mrPath(project, iid)}`);
        }

        /** @returns {Promise<object[]>} every discussion of a merge request. */
        listDiscussions(project, iid) {
            return this.get(`${GitlabApi.mrPath(project, iid)}/discussions`, { per_page: 100 });
        }

        /** @returns {Promise<object[]>} the award emoji of a merge request. */
        listAwardEmoji(project, iid) {
            return this.get(`${GitlabApi.mrPath(project, iid)}/award_emoji`, { per_page: 100 });
        }

        static mrPath(project, iid) {
            return `${GitlabApi.projectPath(project)}/merge_requests/${encodeURIComponent(iid)}`;
        }
    }

    root.GitlabMrTools = root.GitlabMrTools || {};
    root.GitlabMrTools.api = { GitlabApi, HttpError };
})(typeof globalThis !== 'undefined' ? globalThis : window);
