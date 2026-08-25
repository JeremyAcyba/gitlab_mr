/** Settings UI. Everything is persisted as soon as the user changes it. */
(function () {
    'use strict';

    const settingsModule = globalThis.GitlabMrTools.settings;
    const { WORK_WITH } = settingsModule;

    const SAVED_MESSAGE_DURATION_MS = 2000;
    /** Debounce, so typing a username does not write to storage on every key. */
    const SAVE_DEBOUNCE_MS = 300;

    const fields = {
        username: document.getElementById('gitlab-mr__settings__username'),
        url: document.getElementById('gitlab-mr__settings__url'),
        urlError: document.getElementById('gitlab-mr__settings__url__error'),
        upvotesRadio: document.getElementById('gitlab-mr__upvotes'),
        approvalRadio: document.getElementById('gitlab-mr__approval'),
        upvotes: document.getElementById('gitlab-mr__settings__upvotes'),
        upvotesContainer: document.getElementById('gitlab-mr__settings__upvotes__container'),
        tracking: document.getElementById('gitlab-mr__track__mr'),
        colorActions: document.getElementById('gitlab-mr__color_action'),
        colorWait: document.getElementById('gitlab-mr__color_wait'),
        colorDone: document.getElementById('gitlab-mr__color_done'),
        saved: document.getElementById('gitlab-mr__saved')
    };

    let savedMessageTimer;

    /** @param {ReturnType<typeof settingsModule.normalize>} settings */
    function render(settings) {
        fields.username.value = settings.username;
        fields.url.value = settings.url;
        fields.upvotesRadio.checked = settings.working_with === WORK_WITH.UPVOTES;
        fields.approvalRadio.checked = settings.working_with === WORK_WITH.APPROVALS;
        fields.upvotes.value = String(settings.upvotes);
        fields.tracking.value = settings.tracking;
        fields.colorActions.value = settings.colors.actions;
        fields.colorWait.value = settings.colors.wait;
        fields.colorDone.value = settings.colors.done;

        syncUpvotesVisibility();
    }

    function syncUpvotesVisibility() {
        fields.upvotesContainer.hidden = !fields.upvotesRadio.checked;
    }

    /** @returns {object} the raw form values, normalized on the way to storage. */
    function readForm() {
        return {
            username: fields.username.value,
            url: fields.url.value,
            working_with: fields.approvalRadio.checked ? WORK_WITH.APPROVALS : WORK_WITH.UPVOTES,
            upvotes: fields.upvotes.value,
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

    async function save() {
        const form = readForm();

        // An unparseable URL is dropped by `normalize`, which would silently
        // disable the extension; tell the user instead.
        const urlIsInvalid = form.url.trim() !== '' && settingsModule.parseGitlabUrl(form.url) === null;
        fields.urlError.hidden = !urlIsInvalid;
        if (urlIsInvalid) {
            return;
        }

        await settingsModule.save(form);
        showSavedMessage();
    }

    function debounce(fn, delay) {
        let timer;
        return () => {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    function bindEvents() {
        const saveNow = () => {
            save().catch((error) => console.warn('[gitlab-mr-tools] could not save settings:', error));
        };
        const saveSoon = debounce(saveNow, SAVE_DEBOUNCE_MS);

        // `input` covers typing, pasting and the number spinners in one go.
        fields.username.addEventListener('input', saveSoon);
        fields.url.addEventListener('input', saveSoon);
        fields.upvotes.addEventListener('input', saveSoon);

        [fields.upvotesRadio, fields.approvalRadio].forEach((radio) => {
            radio.addEventListener('change', () => {
                syncUpvotesVisibility();
                saveNow();
            });
        });

        [fields.tracking, fields.colorActions, fields.colorWait, fields.colorDone].forEach((field) => {
            field.addEventListener('change', saveNow);
        });
    }

    async function init() {
        render(await settingsModule.load());
        bindEvents();
    }

    init().catch((error) => console.warn('[gitlab-mr-tools] could not open the settings:', error));
})();
