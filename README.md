# SDET Academy

Static learning app: 7 phases, 21 exercises, 3 progressive hints + approach + solution per exercise.

- **Home and free demo:** the app opens on a home page; the logo always returns to it. Phase 1 (Prompting and LLM basics) is a free demo chapter. Phases 2 to 7 ask for a sign-in.
- **Sign-in is a local profile, not a secure account.** It stores a display name in this browser (no password, no server). The site is static files, so the locked chapters are still in the page source: the sign-in is a product gate, not protection. Signing out never deletes progress. To add real accounts later, replace `getUser`, `signIn` and `signOut` in `index.html` (design in `docs/design-home-demo-signin.md`). Change which chapters are free with `FREE`.
- The logo is in `logo.svg` (the page uses an inline copy that follows the theme).

Run: open `index.html`, or `python -m http.server 8765` in this folder and visit http://127.0.0.1:8765.

- Theme selector: System (follows your OS live), Light or Dark.
- Daily streak: goal 60 minutes a day. Use the built-in study timer or add minutes by hand; hit the goal to extend your streak and unlock fictional cups at 3, 7, 14, 30, 60 and 100 days. Stored locally like the rest of your progress. Edit `GOAL` and `CUPS` in `index.html` to change them.
- API key & live checks (optional): enter your own OpenRouter (or any OpenAI-compatible) key to run five live checks from the browser: connection, JSON output, tool calling, output variance and a prompt-injection canary. The key stays in your browser (session only unless you tick "Remember"), is sent only to the API base URL you set, and is never part of Export progress.
- The Theme "System" option follows what your browser reports. On Windows that is "default app mode" in Settings > Personalization > Colors, and browsers can override it in their own Appearance settings.
- Progress, checklists and notes are saved in browser localStorage. Use Export/Import to back up or move devices.
- Content lives in `content1.js` (phases 1-3) and `content2.js` (phases 4-7). Add or edit phases there; no build step.
- Prerequisites: Python 3.11+, Node 18+ (Phase 3), Git, a GitHub account. Plan for 8-10 hours a week (about 16 weeks). Free-tier models have daily call limits, so see the budget note in the Phase 1 setup card.
- Exercise code is Python (Playwright samples are TypeScript). Library APIs (DeepEval, promptfoo, Playwright Agents, MCP SDK) change often; check current docs.
