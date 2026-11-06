# SDET Academy: logo, home page, free demo chapter and sign-in

## Summary

The app opens on a new home page. A logo in the header always returns to it. Visitors who are not signed in can use one chapter, Phase 1 (Prompting and LLM basics), as a free demo. Phases 2 to 7 ask them to sign in. Sign-in creates a local profile in the browser. It is a product gate, not a security control.

## Goals

- A logo for "SDET Academy" that works in light and dark themes and links to the home page.
- A home page that explains the course and offers two actions: try the demo, or sign in.
- Phase 1 is fully usable without signing in: Learn tab, exercises, hints, notes and progress.
- Phases 2 to 7 need a signed-in profile.
- A visible sign-in option in the header and on every lock panel. A signed-in user can sign out.

## Non-goals

- Real authentication. The site is static files on GitHub Pages with no server, so the locked chapters are still in the page source and anyone can read them. The sign-in only decides what the interface shows.
- Per-user progress. One progress store per browser, shared before and after sign-in, so demo progress is kept.
- Passwords, email, verification, social login. No personal data is collected beyond a display name.
- Gating the daily streak page and the API key page. They are study tools, not course content, and they hold the learner's own data. This also keeps timer and streak behaviour unchanged.

## Alternatives considered

| Option | Why not |
|---|---|
| Real accounts (Supabase, Firebase, GitHub OAuth) | Needs a backend project, keys and a privacy policy. Can be added later behind the same `getUser` / `signIn` / `signOut` functions. |
| Encrypt locked chapters with a key given at sign-in | Needs a key distribution scheme, which is again a server. |
| Split the locked chapters into a private repository | Static hosting cannot check who is asking. |
| Local profile (chosen) | Works on static hosting, honest about its limits, replaceable. |

## Risks

| Risk | Mitigation |
|---|---|
| Learners think the sign-in is secure | The sign-in form and README say it is a local profile and that content is not protected. |
| Existing bookmarks to `#p3/learn` become locked for signed-out visitors | They see the lock panel with a sign-in button, and sign-in returns them there. |
| Storage is blocked or full | The profile is kept in memory for the session and a message says it will not persist. |

## User flow

1. A visitor opens the site and sees the home page.
2. "Try the free demo" opens Phase 1.
3. In a locked phase the visitor sees a lock panel with a "Sign in to continue" button.
4. The sign-in form asks for a display name. Submitting creates the profile and unlocks Phases 2 to 7.
5. The header then shows the name and a "Sign out" button. Signing out locks Phases 2 to 7 again. Progress is not deleted.

## Behaviour

| Area | Signed out | Signed in |
|---|---|---|
| Home page, sign-in page | open | open (the sign-in page redirects to the home page) |
| Phase 1 (demo) | open | open |
| Phases 2 to 7 | lock panel | open |
| Daily streak, API key and live checks | open | open |
| Export, Import, Reset, Theme | open | open |

Rules:

- **Default view.** An empty address hash opens the home page (`home`). An unknown hash also opens the home page.
- **Gate.** The gate lives in the code that draws the sidebar and the main area, so Back, Forward, bookmarks and typed addresses are all covered.
- **Return address.** When a signed-out visitor requests a locked phase, the app remembers that phase in memory (`view.next`) and opens the sign-in page. After sign-in it opens `view.next` if it is a real, unlocked phase, otherwise Phase 1. Reloading the sign-in page forgets the request and returns to Phase 1.
- **Profile.** One field: `name`, 1 to 60 characters after trimming, stored as JSON `{ "name": "...", "t": <time> }` under its own key `ai-sdet-academy-user`. It is not part of Export. Anything else in storage under that key is treated as no profile.
- **Sign-out.** Removes the profile. It does not touch progress, streak data, the running timer or the API key. Reset (progress) does not delete the profile either.
- **Sidebar.** Locked phases show the word "Sign in" and a lock icon instead of a percentage, so hidden progress is not displayed.
- **Sidebar Home item and overall bar.** The sidebar has a Home item. While signed out, the overall progress bar counts only the free chapters and says "demo chapter".
- **Return address survives.** `view.next` is kept when the visitor presses the header "Sign in" on the sign-in page and across Back and Forward. It is cleared by sidebar or card navigation, by the sidebar Home item, and when the page reloads.
- **Hash navigation.** Back, Forward and the logo scroll to the top. Click navigation also moves focus to the main area.
- **Sign-out focus.** After sign-out the keyboard focus moves to the new Sign in button.
- **Several tabs.** A change to the profile in one tab updates the others.
- **Storage blocked.** The profile is kept in memory for the page session and a message says it will not persist.
- **Import.** Allowed while signed out. Imported progress for locked phases is stored but not shown until sign-in.
- **Logo.** One inline SVG badge in the page script is used for the header, the home page and the page icon, and takes its colours from the theme. `logo.svg` is a standalone copy with fixed colours for use elsewhere.
- **Accessibility.** The logo link has the name "SDET Academy, home". The lock panel and the sign-in page move focus to the main area when they open. The name field has a label, and an error message linked with `aria-describedby` and `role="alert"`. The lock icon is hidden from screen readers.

## Detailed Implementation Plan

Scope: `index.html`, `logo.svg`, `README.md`. The free chapter constant is `FREE = ["p1"]`.

1. **Brand.** Change the title and header text to "SDET Academy". Add the badge SVG string and use it in the header link, the home page and a page-icon link generated at start-up.
2. **Views.** Add `home` and `signin` to the special views next to `streak` and `live`. `setHash` and `fromHash` treat the four special names alike. Empty and unknown hashes become `home`.
3. **Auth.** Add `getUser()`, `signIn(name)` and `signOut()` that read and write the profile defensively (try/catch, type check, length cap, in-memory fallback).
4. **Gate.** `isLocked(phaseId)` is true when there is no profile and the phase is not in `FREE`. `renderMain` draws a lock panel for locked phases. The sidebar and the header streak chip stay as they are, except locked phases show "Sign in".
5. **Home page.** Hero (badge, promise, two buttons), and seven phase cards generated from the phase list with "Free demo" or "Sign in" tags.
6. **Sign-in page.** A form with a name field, a note that this is a local profile and not a secure account, a Continue button and a link to the demo. Submit and Enter both work.
7. **Header.** `renderHeader()` draws the sign-in button or the name and sign-out button. It runs from `renderAll`, after sign-in or sign-out, and on the storage event.
8. **README.** Document the demo, the sign-in model and its limits.

## Test plan

Each item passes when the stated result is seen in a browser.

| Test | Pass when |
|---|---|
| Empty hash | The home page shows |
| Logo from the home page, a phase, streak, live checks, sign-in, a lock panel | The home page shows each time |
| Phase 1 signed out | Learn tab, a hint reveal and an exercise tick all work and persist |
| Phases 2 to 7 signed out | Each shows the lock panel, with no phase content in the page text |
| Deep link `#p3/learn` signed out, then sign in | Phase 3 opens after sign-in |
| Back and Forward across locked and open pages | The lock panel and content follow the address |
| Valid name, empty name, 61 characters, only spaces | First works, the others show an error and create no profile |
| Sign out | Locked phases lock again, progress is unchanged |
| Reload while signed in and out | State is kept |
| Corrupt profile in storage (a string, an array, a very long name) | Treated as signed out, no error |
| Storage blocked | Sign-in works for the session and shows the message |
| Two tabs | Sign-in or sign-out in one updates the other |
| Import while signed out | Imported data loads, locked phases show "Sign in" with no percentage |
| Dark and light themes, 375 px wide window | Logo, header and forms are readable, no overflow |
| Keyboard and screen reader labels | Tab reaches every control, the form submits with Enter, errors are announced |
