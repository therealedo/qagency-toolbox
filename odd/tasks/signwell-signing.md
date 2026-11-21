# SignWell signing through a local helper

Objective: agents send the Consent and the SOA for signature from the toolbox through the SignWell API, and the signed PDF is filed on the Network.
Branch: `feat/signwell-signing` from `main` (2d1ea82). Delivery: work-unit commits; push, PR and merge are the user's decisions. Test runner: `node --test tests/*.test.js`.

## Specs

- S1 SignWell API (Light plan), not self-hosted DocuSeal. User: "ok go with SignWell, plan the integration".
- S2 The toolbox page never holds the API key and never calls SignWell itself. A local helper (`signing-helper.ps1`, Windows PowerShell 5.1, no admin rights) on `127.0.0.1` holds the key encrypted with DPAPI (CurrentUser) and makes the calls. Client data goes in a JSON body, never in a URL.
- S3 Helper boundary: it binds `127.0.0.1` only; any `Host` other than `127.0.0.1:<port>` / `localhost:<port>` gets 403; every route except `GET /health` requires the per-install `X-Helper-Token`; POST bodies must be `application/json` (415 otherwise); CORS answers only `Origin: null` (the `file://` page); logs hold metadata only (no client data, URLs, key or token).
- S4 "Use SignWell only with fake data": the helper sends documents in SignWell test mode unless it was explicitly configured for real use, and the toolbox says which mode it is in.
- S5 "Never handle the user's credentials or tokens": the API key is typed by the support person into the installer prompt; no code path prints, logs or returns it.
- S6 The toolbox sends the current Consent or SOA (template ID per form in Ajustes, the same field API IDs as the signing link, the client's name and email, the language, the agent's name) and shows the result (sent, or the error).
- S7 The helper keeps only document IDs on disk and polls SignWell for their status; the Network file name and folder travel in the SignWell document's metadata.
- S8 "Toolbox saves it": when a sent document is completed, the toolbox saves the signed PDF, byte for byte, in its Network folder with the Network file name, without asking, when that folder is already chosen and allowed.
- S9 "with a optional manual save option just in case": each signed document also has **Guardar** (save to the Network, choosing or allowing the folder) and **Descargar** (browser download). After a download the agent confirms with **Ya lo guardé**.
- S10 The toolbox deletes a document in SignWell only after a confirmed save (automatic or **Guardar**) or **Ya lo guardé**. Until then it stays listed.
- S11 The Windows installer installs the helper, asks for the key, writes the token for the toolbox, starts the helper at logon; uninstall removes all of it. The packaged zip carries the helper.
- S12 README, LEEME and the help texts describe the flow.
- S13 (replaces the delete-after-save part of S10) "a dashboard on the app where we users can see the history of signed documents, the status on pending ones". History stays in SignWell ("Keep in SignWell"): saving a signed PDF no longer deletes it; the helper keeps on disk only document IDs, the send date, the final status and whether it was saved, and reads names, status and dates from SignWell. There is no SignWell list endpoint, so the history is the documents sent from this computer.
- S14 "the option to delete any cancelled or expired": a document that ended unsigned (canceled, expired, declined, no longer in SignWell) can be deleted in SignWell from the dashboard, after a confirmation. Assumption: declined counts as unsigned too.
- S15 "cancel the ones sent by mistake": a document still waiting for the signature can be cancelled from the dashboard, after a confirmation (SignWell's DELETE "will also cancel document signing (if in progress)").
- S16 A signed document is never deleted from the dashboard; it stays in the history with Descargar.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S6 (payload) | inline | done: RED (buildSendPayload not a function), then GREEN 282/282 | 4943f09 |
| T2 | S2, S3, S4, S5, S7 | inline | done: helper tests against a fake SignWell 2/2; a mutation (token check off) fails the test | 8f7195d |
| T3 | S5, S11 | inline | done: package test; PowerShell parse check, 0 errors; installer not run on a real profile (it would touch real shortcuts) | d01e632 |
| T4 | S6, S8, S9, S10, S4 | inline | done: 287/287. Headless Edge smoke test (file:// page + real helper + fake SignWell): listed, Descargar byte-identical, Ya lo guardé → DELETE. Not run in a browser: the Enviar para firmar click, and auto-save into a chosen folder (needs the folder picker) | 89bb9cc |
| T5 | S12 + verification | inline | done: verifier S1–S12 pass except B1; B1 and A1 fixed (RED→GREEN redirect test), plus A2/A5/A6/A8; 289/289; smoke test rerun OK; native review (risk, resilience, reliability): 0 findings, approved and acknowledged (lineage review-60e5b9ab1c00e551) | 42f265e, 5a13307, e65b26a |

| T6 | S13–S16 (helper: history, /saved, /delete) | inline | done: RED (no documentos.json), then GREEN helper 4/4 | 93aede6, b102034 |
| T7 | S13–S16 (Firmas dashboard view) | inline | done: RED (signActions not a function), then GREEN forms 32/32; headless Edge smoke test: badge 1, 4 rows, Descargar byte-identical, Ya lo guardé → /saved (no DELETE), Cancelar envío and Borrar → DELETE, no Borrar on signed rows, no horizontal scroll at 390px | 93aede6, b102034 |
| T8 | S12 for S13–S16 (README, LEEME) | inline | done | fcf9078, 93449bf |

Route evidence: one feature with one contract (helper protocol) shared by all units; app.js, index.html and README are shared, so no parallel writers.

## Log

- L1 (2026-11-20) User: "ok go with SignWell, plan the integration". Then: "Toolbox saves it" / "with a optional manual save option just in case". Then: "Start building now".
- L2 Constraints from the starting session: "Use SignWell only with fake data." "Never handle the user's credentials or tokens." "Never commit private/ (team file, signing key) or raw sample PDFs." Commits: Conventional Commits, no AI attribution.
- L3 Large: the pilot (BAA, templates, test mode on real phones) is external, and the feature spans helper, installer and UI. Risk: item 2 (key storage, local listener, CSP), item 5 (installer). Independent verifier at the end.
- L4 Helper protocol (port 47815): `GET /health` → `{ok, testMode, version}`; `POST /send` `{templateId, placeholder, recipient:{name,email}, fields:[{api_id,value}], language, requester, meta:{fileName, netKey, line, kind}}` → `{id, status}`; `POST /list` → `{docs:[{id, status, meta, error?}]}`; `POST /pdf` `{id}` → PDF bytes; `POST /ack` `{id}` → deletes in SignWell and forgets it. Token: the installer writes `helper-config.js` (`window.QA_HELPER = {port, token}`) beside the installed HTML; the page loads it at run time (not inlined by the build).
- L5 T1–T5 committed. For T2, the tests were written alongside the code, with a mutation check instead of a RED run. Open pilot items, to check in SignWell test mode and real Chrome:
  - Chrome's Local Network Access prompt for file:// → 127.0.0.1 (headless Edge allowed it).
  - Whether create-from-template accepts `language` and `metadata`, and the placeholder named `Cliente`.
  - Whether prefilled fields are editable.
  - DELETE of a completed document.
- L6 The independent verifier found one blocker, B1: the first update from an installed 1.21.2 (an old `actualizar.ps1` without `-SinPreguntar`) would stop to ask for the key. Fix: ask only on a new install (`-not $habiaAcceso`). Its high advisory A1, the key following redirects through the default HttpClient, was fixed with AllowAutoRedirect off and a key-less follow of one GET redirect, pinned by a test that failed before the fix. Also fixed:
  - A2: the helper starts in `$destino`.
  - A5: real mode is labelled.
  - A6: the `-Clave` message when Enter keeps an existing key.
  - A8: the tick comparison uses the safe name.
  Left as advisories:
  - A3: one request at a time; a slow SignWell blocks /health.
  - A4: "Quitar" deletes unsigned final documents after a confirmation. To confirm with the user.
  - A7: /health answers null-origin callers, by design; the token is the gate.
  - A9: the 500/200-character limits.
- L7 (2026-11-20) User: "I would rather have a dashboard on the app where we users can see the history of signed documents, the status on pending ones and the option to delete any cancelled or expired, as well as cancel the ones sent by mistake like". Asked where history lives; user chose "Keep in SignWell (Recommended)". SignWell docs (developers.signwell.com/reference/deletedocument.md, getdocument.md): DELETE cancels signing if in progress; no list-documents endpoint; GET returns status, created_at, updated_at, recipients[name,email,status]. This settles A4.
- L8 Independent verifier on dd1f9c3..fcf9078: S13–S16 pass, 293/293. Blocker: README still named the removed "Enviados a firmar" bar → fixed (93449bf). Advisories fixed in b102034 with tests that failed before the fix: a 404 no longer turns a signed document into a deletable one; an unreadable documentos.json is set aside (documentos.json.ilegible-<time>) and the store is written through a temp file; the "Ver más" count after a save. Also fixed: stale forms.js comment, LEEME list of deletable states. Left as advisories: the tiny race between the status re-check and DELETE (SignWell's API can't close it); /list after a restart fetches open docs plus up to `limit` closed ones one by one; a failed v1 migration is not retried (pendientes.json stays for manual recovery). 294/294.
