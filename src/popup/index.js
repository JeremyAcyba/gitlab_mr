/** Settings UI. Everything is persisted as soon as the user changes it. */
(function () {
    'use strict';

    const settingsModule = globalThis.GitlabMrTools.settings;

    const SAVED_MESSAGE_DURATION_MS = 2000;

    const fields = {
        tracking: document.getElementById('gitlab-mr__track__mr'),
        colorActions: document.getElementById('gitlab-mr__color_action'),
        colorWait: document.getElementById('gitlab-mr__color_wait'),
        colorDone: document.getElementById('gitlab-mr__color_done'),
        saved: document.getElementById('gitlab-mr__saved')
    };

    let savedMessageTimer;

    /** @param {ReturnType<typeof settingsModule.normalize>} settings */
    function render(settings) {
        fields.tracking.value = settings.tracking;
        fields.colorActions.value = settings.colors.actions;
        fields.colorWait.value = settings.colors.wait;
        fields.colorDone.value = settings.colors.done;
    }

    /** @returns {object} the raw form values, normalized on the way to storage. */
    function readForm() {
        return {
            tracking: fields.tracking.value,
            colors: {
                actions: fields.colorActions.value,
                wait: fields.colorWait.value,
                done: fields.colorDone.value
            }
        };
    }

    function showSavedMessage() {
        // textContent, never innerHTML: nothing here should ever be parsed as markup.
        fields.saved.textContent = 'Configuration saved';
        clearTimeout(savedMessageTimer);
        savedMessageTimer = setTimeout(() => {
            fields.saved.textContent = '';
        }, SAVED_MESSAGE_DURATION_MS);
    }

    function bindEvents() {
        const save = () => {
            settingsModule
                .save(readForm())
                .then(showSavedMessage)
                .catch((error) => console.warn('[gitlab-mr-tools] could not save settings:', error));
        };

        Object.values(fields)
            .filter((field) => field !== fields.saved)
            .forEach((field) => field.addEventListener('change', save));
    }

    async function init() {
        render(await settingsModule.load());
        bindEvents();
    }

    init().catch((error) => console.warn('[gitlab-mr-tools] could not open the settings:', error));
})();
