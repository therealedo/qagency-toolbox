# Updater and team file

Objective: keep the team roster (names, NPNs) out of the public repo and its history, and let the installed app tell the user about a new version that one double-click installs.
Branch: `feat/updater-team-file` from `feat/office-on-top` (72f420f). Delivery: work-unit commits; push, PR, merge and the history rewrite are the user's decisions. Test runner: `node --test tests/*.test.js`.

## Specs

- S1 The repo and the built files no longer contain the team roster. `js/config.js` ships an empty team; tests use made-up names and NPNs.
  User: "also how can we NOT include the npns and agents info?" — chosen: "Team file + scrub history".
- S2 Ajustes → Equipo can import the team from a JSON file (`QAgency-Equipo.json`) and export the current team to that file. Import validates the file and replaces the list after confirmation; a bad file shows a message and changes nothing. Settings already saved in a browser keep their team.
- S3 A team file with the current roster is produced outside version control so the office can share it privately (Network folder).
- S4 "Notice + Actualizar.bat": the installed app (opened from a file) checks GitHub for a newer version and, when there is one, shows a notice telling the user to run the Actualizar shortcut. The check asks only for the version number; nothing else leaves the page.
  User: "Also an update button to automatically install the latest version from github IF there's a new version" — chosen: "Notice + Actualizar.bat".
- S5 `Actualizar.bat` (installed with a Desktop and Start menu shortcut) compares the installed version with GitHub's, and only when GitHub's is newer downloads the Windows package and reinstalls it. It refuses a package whose version does not match. Desinstalar removes the updater and its shortcuts.
- S6 The git history is rewritten so no commit contains the roster (including the built dist files), then force-pushed — only after the user confirms right before.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2, S3 | inline | in progress | |
| T2 | S4, S5 | inline | pending | |
| T3 | S6 | inline | pending (needs the user's go-ahead) | |

## Log

- L1 (2026-11-15) User: "Also an update button to automatically install the latest version from github IF there's a new version" → "Notice + Actualizar.bat". Then: "also how can we NOT include the npns and agents info?" → "Team file + scrub history".
- L2 Large because T3 waits on the user's confirmation and rewrites every branch. Inline: units share app.js, index.html, README and the version, so no parallel writers. Risk: item 2 (CSP opens one GitHub URL), item 5 (installer, update delivery), item 1 (history rewrite).
