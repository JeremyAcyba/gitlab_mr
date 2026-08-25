/** Small DOM helpers shared by the page modules. */
(function (root) {
    'use strict';

    const DEFAULT_TIMEOUT_MS = 10000;

    /**
     * Resolves once at least one element matches, or after `timeout`.
     * GitLab renders its listings client-side, so the nodes we need are rarely
     * there when the content script runs.
     *
     * @param {string} selector
     * @param {{timeout?: number}} [options]
     * @returns {Promise<Element[]>} the matches, empty when it timed out.
     */
    function waitForElements(selector, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
        const found = () => Array.from(document.querySelectorAll(selector));

        const immediate = found();
        if (immediate.length > 0) {
            return Promise.resolve(immediate);
        }

        return new Promise((resolve) => {
            const stop = (result) => {
                clearTimeout(timer);
                observer.disconnect();
                resolve(result);
            };

            const observer = new MutationObserver(() => {
                const matches = found();
                if (matches.length > 0) {
                    stop(matches);
                }
            });

            const timer = setTimeout(() => stop(found()), timeout);
            observer.observe(document.documentElement, { childList: true, subtree: true });
        });
    }

    /**
     * Calls `callback` every time the SPA navigates to another URL. GitLab does
     * not reload the page between listings, so without this the extension only
     * ever decorates the first page the user lands on.
     *
     * @param {(url: string) => void} callback
     */
    function onNavigation(callback) {
        let previous = window.location.href;

        const check = () => {
            if (window.location.href !== previous) {
                previous = window.location.href;
                callback(previous);
            }
        };

        window.addEventListener('popstate', check);
        // GitLab navigates with the History API, which fires no event of its own.
        new MutationObserver(check).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    /**
     * First selector that matches something, so we survive GitLab renaming its
     * classes between releases.
     *
     * @param {string[]} selectors
     * @returns {Element[]}
     */
    function queryFirstMatching(selectors) {
        for (const selector of selectors) {
            const matches = Array.from(document.querySelectorAll(selector));
            if (matches.length > 0) {
                return matches;
            }
        }
        return [];
    }

    root.GitlabMrTools = root.GitlabMrTools || {};
    root.GitlabMrTools.dom = { waitForElements, onNavigation, queryFirstMatching };
})(typeof globalThis !== 'undefined' ? globalThis : window);
