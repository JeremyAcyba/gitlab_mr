/**
 * Single source of truth for the extension settings.
 *
 * Loaded both by the popup (settings UI) and by the content scripts, so the
 * defaults, the validation and the storage key can never drift apart.
 */
(function (root) {
    'use strict';

    const STORAGE_KEY = 'gitlabmr';

    /** Merge request tracking modes. */
    const TRACKING = {
        ALL: '',
        NOT_MINE: 'not_mine',
        NOT_MINE_PARTICIPATE: 'not_mine_participate'
    };

    /** How a merge request is considered "approved enough" to be merged. */
    const WORK_WITH = {
        UPVOTES: 'upvotes',
        APPROVALS: 'approvals'
    };

    const DEFAULTS = Object.freeze({
        username: '',
        url: '',
        working_with: WORK_WITH.UPVOTES,
        upvotes: 2,
        tracking: TRACKING.ALL,
        colors: Object.freeze({
            actions: '#FF2D00',
            wait: '#FFDC00',
            done: '#00E90E'
        })
    });

    const HEX_COLOR = /^#[0-9a-f]{6}$/i;

    /**
     * Only http(s) URLs are accepted: the configured origin is what we compare
     * the current page against and what we build API calls on top of, so a
     * `javascript:` or `data:` value must never make it that far.
     *
     * @param {unknown} value
     * @returns {URL|null}
     */
    function parseGitlabUrl(value) {
        if (typeof value !== 'string' || value.trim() === '') {
            return null;
        }

        let url;
        try {
            url = new URL(value.trim());
        } catch {
            return null;
        }

        return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    }

    /**
     * Coerces anything coming out of `chrome.storage` (or out of the settings
     * form, where every field is a string) into a well formed settings object.
     *
     * @param {unknown} raw
     * @returns {{username: string, url: string, working_with: string, upvotes: number, tracking: string, colors: {actions: string, wait: string, done: string}}}
     */
    function normalize(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const rawColors = source.colors && typeof source.colors === 'object' ? source.colors : {};

        const upvotes = Number.parseInt(source.upvotes, 10);
        const gitlabUrl = parseGitlabUrl(source.url);

        return {
            username: typeof source.username === 'string' ? source.username.trim() : DEFAULTS.username,
            // Stored normalized (no trailing slash, no query/hash) so that every
            // consumer can rely on the exact same string.
            url: gitlabUrl ? gitlabUrl.origin + stripTrailingSlash(gitlabUrl.pathname) : DEFAULTS.url,
            working_with:
                source.working_with === WORK_WITH.APPROVALS ? WORK_WITH.APPROVALS : WORK_WITH.UPVOTES,
            upvotes: Number.isInteger(upvotes) && upvotes > 0 ? upvotes : DEFAULTS.upvotes,
            tracking: Object.values(TRACKING).includes(source.tracking) ? source.tracking : DEFAULTS.tracking,
            colors: {
                actions: normalizeColor(rawColors.actions, DEFAULTS.colors.actions),
                wait: normalizeColor(rawColors.wait, DEFAULTS.colors.wait),
                done: normalizeColor(rawColors.done, DEFAULTS.colors.done)
            }
        };
    }

    function normalizeColor(value, fallback) {
        return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
    }

    function stripTrailingSlash(path) {
        return path === '/' ? '' : path.replace(/\/+$/, '');
    }

    /**
     * @returns {Promise<ReturnType<typeof normalize>>}
     */
    async function load() {
        const stored = await chrome.storage.sync.get([STORAGE_KEY]);
        return normalize(stored[STORAGE_KEY]);
    }

    /**
     * @param {object} settings
     * @returns {Promise<ReturnType<typeof normalize>>} the settings as persisted.
     */
    async function save(settings) {
        const normalized = normalize(settings);
        await chrome.storage.sync.set({ [STORAGE_KEY]: normalized });
        return normalized;
    }

    /** @returns {boolean} true when the extension has enough to do its job. */
    function isConfigured(settings) {
        return Boolean(settings.username) && Boolean(settings.url);
    }

    const settingsModule = {
        STORAGE_KEY,
        TRACKING,
        WORK_WITH,
        DEFAULTS,
        parseGitlabUrl,
        normalize,
        load,
        save,
        isConfigured
    };

    root.GitlabMrTools = root.GitlabMrTools || {};
    root.GitlabMrTools.settings = settingsModule;

    /* Exported for the unit tests; unused inside the browser. */
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = settingsModule;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
