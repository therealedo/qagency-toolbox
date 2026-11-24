# Rebuild the signing server from the public repo

Objective: anyone with the public repo and a Google Cloud project can rebuild the signing server as it is today, with no sensitive data in the repo. This covers the six DocuSeal templates first, and later the server address.
Branch: `feat/rebuild-from-repo` from `origin/main` (efe18bb, 1.32.1). Delivery: work-unit commits on this branch; push, PR, merge and the release (dist signing) go through the parent session. Test runner: `node --test tests/*.test.js`.

## Specs

- S1 Templates in the repo: the six DocuSeal templates (consent-qa-es, consent-qa-en, consent-ath-es, consent-ath-en, soa-es, soa-en) are saved in the repo as layouts: signers in order, and every field with its name, type, signer, settings and position. One command recreates them on a new DocuSeal server from the repo's PDFs (`vendor/forms`) and prints each template's number for Ajustes. The layouts are exported from the live server (2026-11-23), and their PDFs are byte-identical to `vendor/forms` (checked by SHA-256).
- S2 Server address: a server rebuilt with a new address works with the toolbox. Design is still open; it comes after S1 ("start with the templates in the repo and later the server address").
- S3 No sensitive data in the repo: no API key, office codes, client data or personal emails. The API key stays on the server and is never handled by the agent. Carried constraints: "Never handle the user's credentials or tokens." "Never commit private/ (team file, signing key) or raw sample PDFs."
- S4 Any operation on the real server is authorized by the user first (destination, operation, credential).
- S5 README and the IT guide are updated; tests use fake data; the next release is above 1.32.1 and goes through the parent session.
- Out of scope: moving the GitHub repo and the update signing key to the agency ("The github repo I can handle it later").

## Tasks

- T1 (S1, S3) Save the six layouts to `tools/docuseal/plantillas.json`, and add a pure builder for the create-template API requests, with tests. Route: inline. Status: done (7af001a, plus sha256 per template in the next commit).
- T2 (S1, S3, S4) Add a `crear-servidor.sh` option that sends those requests to DocuSeal on the server (the key is read there) and prints the new template numbers; README. Route: inline. Status: done locally, tests with a fake DocuSeal and the real relay against a fake HTTP server (12 tests; mutation checks caught a widened relay allowlist and a skipped PDF check). Not tried on the real server (S4: needs the user). Commit: see Log L6.
- T3 (S2) Server address. Route: inline. Status: pending (after S1).

## Log

- L1 2026-11-23 user: "Thinking about it again i dont think they are going to go rogue, they probably want full access just in case i decide to leave the agency some they, so they can keep operating it. So lets give them full access and make sure they can keep operating it, so lets do that. Just make sure we can rebuild the same infraestructure from the public repo without publishing any sensitive data as we have been doing so far. Edit the png/html guide"
- L2 2026-11-23 user: "start with the templates in the repo and later the server address. The github repo I can handle it later cause thats another talk if i decide to leave at some point"
- L3 IT guide updated for full access (Owner in Google Cloud, one DocuSeal admin per person; free DocuSeal only has the Administrador role, checked on the server). The rebuild gaps found: templates live only in DocuSeal, the server address is built into the helper, and updates come from a personal repo and signing key.
- L5 Research: free DocuSeal has no create-template API (POST /api/templates/pdf is Pro). Free has GET /api/templates and PUT /api/templates/:id, which replaces `submitters` and `fields` (areas relative 0..1, page 0-based). Plan: a person uploads the six PDFs (named `<key>.pdf`, written by `node tools/docuseal/plantillas.js pdfs <folder>`). Then `node tools/docuseal/plantillas.js aplicar [--prefijo X]` in Cloud Shell drives `tools/docuseal/relevo.py` on the server over IAP SSH; the relay reads the key there. It checks each template's PDF SHA-256, refuses templates that already have submissions or repeated names, PUTs the layout, and prints the numbers. An `exportar` command refreshes plantillas.json. Next: write plantillas.js (pure builder plus orchestrator), tests with a fake relay and the real relay against a fake HTTP DocuSeal, add sha256 to plantillas.json, README; then a real-server try with a `prueba-` prefix after the user approves. relevo.py is drafted and untested (not committed).
- L4 Exported the six template layouts read-only from the logged-in editor (`data-template`), rounded to 6 decimals, with no ids, uuids or user data. The saved copy's SHA-256 matches the browser's export.
- L6 2026-11-24 Built `tools/docuseal/plantillas.js` (pdfs, aplicar, exportar, --prefijo) and `tools/docuseal/relevo.py`; plantillas.json now has each PDF sha256. Tests were written after the code (no RED observed); two deliberate breaks made them fail. Full suite 356/0. Next: real-server try on `prueba-` copies with the user, then T3.
- L7 2026-11-24 Native review of 8ac7e8b (lenses risk, reliability; user granted): approved and acknowledged (lineage review-420811f9c4783ac6). Non-blocking follow-ups: R1-001/R1-002/R3-006 relevo.py:26-30 (allowlist regexes), R3-001 plantillas.js:171-178 (relay line handling), R3-002 :197, R3-003 :209, R3-004 :142, R3-005 :225. T3 waits on one product question: does the agency have a domain whose DNS can point a name (for example firmas.<domain>) at the server?
