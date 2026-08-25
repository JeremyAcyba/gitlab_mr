/**
 * Single source of truth for the extension settings.
 *
 * Loaded both by the popup (settings UI) and by the content scripts, so the
 * defaults, the validation and the storage key can never drift apart.
 *
 * The instance URL and the username are deliberately absent: they are resolved
 * from the page itself (see content/instance.js), which is what lets the
 * extension work on several GitLab instances at once.
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

    const DEFAULTS = Object.freeze({
        tracking: TRACKING.ALL,
        colors: Object.freeze({
            actions: '#FF2D00',
            wait: '#FFDC00',
            done: '#00E90E'
        })
    });

    const HEX_COLOR = /^#[0-9a-f]{6}$/i;

    /**
     * Coerces anything coming out of `chrome.storage` into a well formed
     * settings object, dropping the keys older versions used to store.
     *
     * @param {unknown} raw
     * @returns {{tracking: string, colors: {actions: string, wait: string, done: string}}}
     */
    function normalize(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const rawColors = source.colors && typeof source.colors === 'object' ? source.colors : {};

        return {
            tracking: Object.values(TRACKING).includes(source.tracking) ? source.tracking : DEFAULTS.tracking,
            colors: {
                actions: normalizeColor(rawColors.actions, DEFAULTS.colors.actions),
                wait: normalizeColor(rawColors.wait, DEFAULTS.colors.wait),
                done: normalizeColor(rawColors.done, DEFAULTS.colors.done)
            }
        };
    }

    /** Colours end up in a stylesheet value, so only real hex codes get through. */
    function normalizeColor(value, fallback) {
        return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
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

    const settingsModule = { STORAGE_KEY, TRACKING, DEFAULTS, normalize, load, save };

    root.GitlabMrTools = root.GitlabMrTools || {};
    root.GitlabMrTools.settings = settingsModule;

    /* Exported for the unit tests; unused inside the browser. */
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = settingsModule;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
