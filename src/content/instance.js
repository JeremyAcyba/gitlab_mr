/**
 * Figures out, from the page alone, which GitLab we are on and who we are.
 *
 * `GET /api/v4/user` answers both questions at once: it is same-origin, it
 * authenticates with the session cookie like every other call the extension
 * makes, and a valid answer is a far stronger "this really is GitLab, and I am
 * logged in" signal than any DOM marker. That is why the extension needs no
 * username and no instance URL in its settings, and why it works on any number
 * of self-hosted instances at once.
 */
(function (root) {
    'use strict';

    const { GitlabApi } = root.GitlabMrTools.api;

    /** Endpoints GitLab serves at a fixed place under its base path. */
    const BASE_PATH_LANDMARKS = [
        ['link[rel="search"]', '/search/opensearch.xml'],
        ['link[rel="manifest"]', '/-/manifest.json']
    ];

    /** Path segments that can only appear right after the base path. */
    const URL_LANDMARKS = ['/dashboard/', '/groups/'];

    /**
     * A self-hosted GitLab can live under a sub-path (`https://host/gitlab/`),
     * and nothing on the page states it outright. We collect every plausible
     * base path and let `resolve` settle it by asking the API.
     *
     * @param {string} pathname the current page path.
     * @param {string[]} landmarkHrefs hrefs read from BASE_PATH_LANDMARKS, in order.
     * @returns {string[]} candidates, most likely first, always ending with ''.
     */
    function candidateBasePaths(pathname, landmarkHrefs) {
        const candidates = [];

        const add = (candidate) => {
            if (typeof candidate === 'string' && !candidates.includes(candidate)) {
                candidates.push(candidate);
            }
        };

        landmarkHrefs.forEach((href, index) => {
            const suffix = BASE_PATH_LANDMARKS[index][1];
            if (typeof href === 'string' && href.endsWith(suffix)) {
                add(new URL(href, 'https://placeholder.invalid').pathname.slice(0, -suffix.length));
            }
        });

        for (const landmark of URL_LANDMARKS) {
            const index = pathname.indexOf(landmark);
            if (index > 0) {
                add(pathname.slice(0, index));
            }
        }

        // The overwhelmingly common case, kept last: a landmark is evidence,
        // the root is only a guess.
        add('');

        return candidates;
    }

    /** @returns {string[]} the landmark hrefs present on the current page. */
    function readLandmarkHrefs() {
        return BASE_PATH_LANDMARKS.map(
            ([selector]) => document.querySelector(selector)?.getAttribute('href') ?? null
        );
    }

    /**
     * @returns {Promise<{basePath: string, url: string, username: string, api: object}|null>}
     *          null when this is not a GitLab we can talk to.
     */
    async function resolve() {
        const candidates = candidateBasePaths(window.location.pathname, readLandmarkHrefs());

        for (const basePath of candidates) {
            const url = window.location.origin + basePath;
            const api = new GitlabApi(url);

            try {
                const user = await api.getCurrentUser();
                if (typeof user?.username === 'string' && user.username !== '') {
                    return { basePath, url, username: user.username, api };
                }
            } catch {
                // Wrong guess, not a GitLab, or not logged in: try the next one.
            }
        }

        return null;
    }

    root.GitlabMrTools.instance = { resolve, candidateBasePaths };
})(typeof globalThis !== 'undefined' ? globalThis : window);
