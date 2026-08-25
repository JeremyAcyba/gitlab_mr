/**
 * Everything that touches the merge request listing DOM.
 *
 * Nothing here builds HTML from strings: the message we append sits next to
 * GitLab-rendered content, and re-serializing that content through `innerHTML`
 * would both re-parse untrusted markup and drop GitLab's own event listeners.
 */
(function (root) {
    'use strict';

    const DECORATED_ATTRIBUTE = 'data-gmt-status';
    const MESSAGE_CLASS = 'gmt-message';

    /** Selectors GitLab has used for the title link, most recent first. */
    const TITLE_SELECTORS = [
        '.merge-request-title',
        '[data-testid="issuable-title-link"]',
        '.issue-title-text',
        '.title'
    ];

    /**
     * A merge request row in the listing. GitLab identifies it with the global
     * merge request id (not the per-project iid).
     *
     * @param {number|string} mergeRequestId
     * @returns {HTMLElement|null}
     */
    function findRow(mergeRequestId) {
        return document.getElementById(`issuable_${mergeRequestId}`);
    }

    function findTitle(row) {
        for (const selector of TITLE_SELECTORS) {
            const title = row.querySelector(selector);
            if (title) {
                return title;
            }
        }
        return null;
    }

    /**
     * Greys out a merge request the user asked not to track.
     *
     * @param {number|string} mergeRequestId
     */
    function dim(mergeRequestId) {
        const row = findRow(mergeRequestId);
        if (row) {
            row.classList.add('gmt-untracked');
        }
    }

    /**
     * Flags a merge request row with its status colour and optional message.
     * Safe to call twice for the same merge request: the previous decoration is
     * replaced instead of stacked.
     *
     * @param {number|string} mergeRequestId
     * @param {{status: string, message: string}} result
     * @param {{actions: string, wait: string, done: string}} colors
     */
    function decorate(mergeRequestId, result, colors) {
        const row = findRow(mergeRequestId);
        if (!row) {
            return;
        }

        row.classList.add('gmt-row');
        row.classList.remove('gmt-untracked');
        row.setAttribute(DECORATED_ATTRIBUTE, result.status);
        row.style.setProperty('--gmt-status-color', colors[result.status] ?? 'transparent');

        row.querySelectorAll(`.${MESSAGE_CLASS}`).forEach((node) => node.remove());

        if (!result.message) {
            return;
        }

        const title = findTitle(row);
        if (!title) {
            return;
        }

        const message = document.createElement('span');
        message.className = MESSAGE_CLASS;
        message.textContent = `(${result.message})`;

        // When the selector matched the link itself, sit next to it rather than
        // becoming part of the clickable title.
        if (title.tagName === 'A') {
            title.after(message);
        } else {
            title.append(message);
        }
    }

    root.GitlabMrTools = root.GitlabMrTools || {};
    root.GitlabMrTools.decorate = { decorate, dim, findRow };
})(typeof globalThis !== 'undefined' ? globalThis : window);
