# Gitlab merge requests tools

A Google Chrome extension that enhances the GitLab merge request listings: at a glance you see
whether a merge request needs something from you (a review, an answer in a thread, or a merge).

Chrome store: https://chrome.google.com/webstore/detail/gitlab-mr-tools/gefblbbchjoiikjegebbmilelbecgcaa

## How it works

The extension colours the left border of each row in a merge request listing. There are 3 statuses.
As a reviewer, only the threads **you opened yourself** are taken into account: a thread somebody
else started is their business until you make it yours.

### Actions needed (default red)

**As a reviewer:** you haven't voted yet and no open thread of yours is waiting on the author — so
either you never reviewed it, or the author answered you and it is your turn again. You also land
here when you voted and one of your open threads ends on a conversation rather than on a code
suggestion, and when you gave a thumbs down without leaving any thread open to explain it.

**As the author:** somebody spoke last in an open thread, or the merge request has its 2 thumbs up
with nothing left open and can be merged.

### Wait (default orange)

**As a reviewer:** you haven't voted, and an open thread of yours is waiting on the author — you
spoke last, or a third party did.

**As the author:** every open thread is on somebody else, or there is no open thread and not enough
thumbs up yet.

### Done (default green)

**As a reviewer:** you gave a thumbs up and every thread you opened is either resolved or ends on a
code suggestion the author can apply on their own.

**As the author:** not applicable — you always have something to do or something to wait for.

## Settings

There is nothing to set up. The extension reads the instance from the page you are on and your
account from `GET /api/v4/user` on that same instance, so it works on gitlab.com and on any number
of self-hosted instances at once, each with its own account.

A merge request counts as approved once it has **2 upvotes and no downvote**.

The popup only holds two preferences, shared by every instance:

| Setting                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| Merge request tracking | Grey out merge requests you don't care about. |
| Colors                 | The colour of each status.                    |

## Development

```bash
npm install     # dev tooling only, the extension itself has no dependency
npm test        # unit tests (node:test)
npm run lint    # eslint
npm run format  # prettier
npm run package # build packages/gitlab-mr-tools-<version>.zip for the Chrome Web Store
```

Load the unpacked extension from the repository root via `chrome://extensions` → _Load unpacked_.

### Layout

| Path                      | Role                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/shared/settings.js`  | Defaults, validation and storage of the settings, shared by the popup and the content scripts. |
| `src/content/api.js`      | GitLab REST API v4 client (`fetch`, concurrency-limited).                                      |
| `src/content/instance.js` | Resolves which GitLab instance the page belongs to, and who we are on it.                      |
| `src/content/status.js`   | Pure decision logic: discussions in, status out. This is what the tests cover.                 |
| `src/content/decorate.js` | Applies a status to a listing row.                                                             |
| `src/content/review.js`   | Ties the API, the status logic and the DOM together for one merge request.                     |
| `src/content/pages.js`    | The project listing and the dashboard/group listings.                                          |
| `src/content/threads.js`  | Collapses resolved threads on a merge request page.                                            |
| `src/content/main.js`     | Entry point: instance check and page routing.                                                  |

The content scripts are plain scripts (no bundler) sharing a single `GitlabMrTools` namespace, so
**the order in `manifest.json` matters**; `test/manifest.test.js` guards it.

## Changelog

### v4.2

- A thumbs down now counts as a verdict, like a thumbs up
- As a reviewer, only the threads you opened yourself are taken into account, and the thumbs other
  people gave no longer influence your own status
- As the author, gathering the thumbs up no longer turns the row red while a thread is still open
- Once you voted, an open thread of yours ending on a code suggestion no longer holds you back

### v4.1

- No configuration left: the instance and the username are read from the page, so the extension
  works on several self-hosted instances at once instead of only the one that was configured
- Removed the upvotes/approvals switch and the upvotes threshold: 2 upvotes and no downvote

### v4.0

- Only run on the GitLab instance configured in the settings — the previous origin check could be
  fooled by any URL merely containing the instance URL
- Stop loading the popup stylesheet from a public CDN
- Build the injected markup as DOM nodes instead of `innerHTML +=`, which used to re-parse
  GitLab-rendered content
- Validate everything read from storage (instance URL scheme, colours, upvote count)
- Fix the dashboard listing picking the wrong project when two projects share the same name
- Fix crashes on threads made only of system notes, and on listings without `data-project-id`
- Fix the thread toggle throwing when clicking its own icon, and restore its missing styles
- Fix parallel requests overwriting each other's state, which could give a merge request the status
  of another one
- Handle "approvals" mode and downvotes consistently on the dashboard
- Re-run on in-app navigation instead of only on a full page load
- Limit concurrent API calls and time them out instead of firing everything at once
- Rewrite on `fetch`/`async`, split into modules, add unit tests, eslint and prettier

### v3.4

- Fix extension for all new gitlab UI

### v3.3

- Fix extension not loading on new gitlab version in specific project

### v3.2

- Fix extension not loading on new gitlab version

### v3.0

- Save the configuration automatically
- Don't display the done color if we still have discussions not resolved even if we approved the MR

### v2.6

- Make the extension work all groups merge request page

### v2.5

- Fix the extension on my merge request page
- Fix the message can be merged not showing up on MR without discussion

### v2

- Make the extension work in the page my merge request
- Add a condition for the "action"

### v1 initial release

- Display how much discussions are not resolved in the listing
- Display color code on the merge request for what you have to do
- Add settings (username, url, upvote needed, color code)
