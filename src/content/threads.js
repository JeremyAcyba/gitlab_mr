/**
 * Collapses resolved discussion threads on a merge request page and adds a
 * toggle to unfold them again.
 */
(function (root) {
    'use strict';

    const { waitForElements } = root.GitlabMrTools.dom;

    /** Selectors GitLab has used for the "resolved" marker of a thread. */
    const RESOLVED_SELECTORS = [
        '.line-resolve-btn.is-active',
        '[data-testid="resolve-discussion-button"].is-active',
        '.discussion-actions .is-active'
    ];

    const COLLAPSED_CLASS = 'gmt-thread--collapsed';
    const TOGGLE_CLASS = 'gmt-thread-toggle';
    const HANDLED_ATTRIBUTE = 'data-gmt-collapsible';

    function collapse(body) {
        body.classList.add(COLLAPSED_CLASS);
    }

    function buildToggle(body) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = TOGGLE_CLASS;
        toggle.textContent = 'Toggle thread';
        toggle.setAttribute('aria-expanded', 'false');

        toggle.addEventListener('click', () => {
            const collapsed = body.classList.toggle(COLLAPSED_CLASS);
            toggle.setAttribute('aria-expanded', String(!collapsed));
        });

        return toggle;
    }

    /**
     * @param {Element} resolvedButton
     */
    function makeCollapsible(resolvedButton) {
        const header = resolvedButton.closest('.note-header');
        const thread = header?.closest('.timeline-content');
        const body = thread?.querySelector('.timeline-discussion-body .note-body');

        if (!body || body.hasAttribute(HANDLED_ATTRIBUTE)) {
            return;
        }

        body.setAttribute(HANDLED_ATTRIBUTE, 'true');
        body.classList.add('gmt-thread');
        collapse(body);
        // Inserted next to the body rather than inside it, so collapsing the
        // body cannot hide its own toggle. Building a node instead of doing
        // `innerHTML +=` also leaves GitLab's markup and listeners untouched.
        body.after(buildToggle(body));
    }

    /**
     * Threads are rendered progressively, so we keep watching instead of
     * decorating once and hoping everything was there.
     *
     * @returns {Promise<void>}
     */
    let started = false;

    async function run() {
        // In-app navigation calls us again; one observer for the whole session
        // is enough, and stacking them would leak.
        if (started) {
            return;
        }
        started = true;

        const selector = RESOLVED_SELECTORS.join(', ');
        const initial = await waitForElements(selector);
        initial.forEach(makeCollapsible);

        const observer = new MutationObserver(() => {
            document.querySelectorAll(selector).forEach(makeCollapsible);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    root.GitlabMrTools.threads = { run };
})(typeof globalThis !== 'undefined' ? globalThis : window);
