# DocuSeal signing (provider switch from SignWell)

Objective: the toolbox sends the Consent and the SOA for signature through our self-hosted DocuSeal server instead of SignWell, keeping the local helper, Firmas and auto-save to the Network.
Branch: `feat/docuseal-signing` from `feat/signwell-signing` (9054c80). Delivery: work-unit commits on this branch, one PR at the end like `signwell-signing`; push, PR and merge go through the parent session. Test runner: `node --test tests/*.test.js`.

## Specs

- S1 Provider switch, Phase 1 of the shared plan `docuseal-integration-plan.md`. User: "start working on that Phase 1". The helper talks to the DocuSeal REST API (`X-Auth-Token`) instead of SignWell. SignWell code is removed (it stays in git history); no dual-provider switch.
- S2 Settings: the server URL (https only) lives in `firma\ajustes.json`, written by the installer. The API token is stored with DPAPI exactly like the SignWell key and is typed by the support person into "Clave de firma.bat". Carried constraint: "Never handle the user's credentials or tokens."
- S3 The helper boundary is unchanged: Host check, `Origin: null` only, `X-Helper-Token`, JSON only, 64 KB body cap, no client data in logs, the token is never sent on a redirect, and the page's CSP still allows only `127.0.0.1:47815`.
- S4 User: "no SMTP for now". Every submission is created with `send_email: false`; the toolbox shows the signing link for the agent to text (Copiar / SMS).
- S5 `/send`: `POST /api/submissions` with the template ID, the `Cliente` submitter (name, email, phone when present) and `fields[]` of `{name, default_value, readonly: true}` using the PDF field names (`TEMPLATES[key].fields`, as the pilot proved), plus metadata `qa_kind`, `qa_line`, `qa_net`, `qa_file`, `qa_agent`. It returns `{id, link}` (submission ID and the client's `embed_src`). User: "for the consents, unlike SOAs, everything should be filled before the client signs, just to clarify".
- S6 SOA, two signers. User: "Is there a way the agent signs it using a link too? after the client sings first?" Send with `order: "preserved"` and a second submitter `Agente`.
  - User: "But very important, those should be prefilled after the client signs, just before the agent signs".
  - User: "Fecha de la cita predetermined to be the same date of the signature." (the date the client signed).
  - User: "metodo de contacto inicial (book of business by default), planes que se discutieron (only the name of the company the client choosed)".
  - User: "the agent phone number, make it fixed/locked too like the rest , it will be taken from the agents NPN from the toolbox (all locked fields will be available to edit (but remain optional for the agent) if they didnt take the data from the toolbox)". User: "That way the agent only has to sign and thats it."
  - The agent's "Firmar" action exists only once the client completed; it fills the agent fields (`PUT /api/submitters/{id}`) right before returning the agent's link. A value with data is sent `readonly: true`; an empty one is not sent (the templates already make every agent field optional except the agent signature). Phones go into the 3/3/4 box fields only with 10 digits.
- S7 `/list`: team-wide `GET /api/submissions`, paged with `limit` up to 100 and `after`. Status comes from the submitter timestamps (`opened_at`, `completed_at`, `declined_at`) and `expire_at`.
- S8 `/pdf`: `GET /api/submissions/{id}/documents?merge=true`, then fetch the temporary URL without the token; the bytes must start with `%PDF` and are returned as is.
- S9 `/saved`: `PUT /api/submitters/{id}` with metadata `qa_saved=1`. The saved flag is shared by the team, so `documentos.json` is no longer needed.
- S10 `/delete`: `DELETE /api/submissions/{id}` (archive). It re-checks the status first and refuses a completed submission.
- S11 Carried constraint: fake data only on the pilot server ("Use SignWell only with fake data" applies to DocuSeal too). No test mode in the helper.
- S12 Toolbox (Phase 2 of the plan): after sending, show the link with Copiar / SMS reusing the existing link texts; Ajustes keeps the template IDs (DocuSeal IDs are numeric); Firmas lists the team's submissions with an "Enviado por" column (metadata `qa_agent`); auto-save runs only when `qa_saved` is not set and the file does not exist.
- S13 README, LEEME and the help texts describe the DocuSeal flow; the version is bumped.

Assumptions (to confirm when they matter):
- A1 The agent's field values are computed at send time (when the note is open) and travel in the `Agente` submitter's metadata (`qa_fields`); the agent step moves them into locked fields. This works from any PC, and the helper keeps no client data on disk.
- A2 The `Agente` submitter gets the NPN agent's name and, when the team file has it, their email. DocuSeal does not mark email as required; to confirm on the pilot server.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1–S5, S11 (helper: DocuSeal client, settings, /health, /send consent + SOA) | inline | done: RED 6/6 fail on the SignWell helper, then GREEN helper 6/6, suite 303/303 | see T3 |
| T2 | S7–S10 (helper: /list team-wide, /pdf, /saved, /delete) | inline | done (same run) | see T3 |
| T3 | S6 (helper: /agent step with the lock rule) | inline | done (same run) | (this commit) |
| T4 | S2 (installer: server URL + token prompt, ajustes.json, wording; package tests) | inline | done: RED (package test: Quitar still read documentos.json), then GREEN 4/4; prompt probed with piped answers (http and a path rejected, bare name saved as https); suite 303/303 | (this commit) |
| T5 | S5, S6 (page: payload with PDF field names, SOA agent values: agent phone by NPN, address, chosen company) | inline | pending | |
| T6 | S4, S12 (page: link with Copiar/SMS, team-wide Firmas with Enviado por, agent Firmar, labels) | inline | pending | |
| T7 | S13 + independent verification | inline + verifier | pending | |

Route evidence: one helper protocol shared by every unit; `signing-helper.ps1`, `app.js`, `forms.js` and the README are shared files, so there are no parallel writers. Risk: item 2 (API token, local listener, public server), item 5 (installer), item 1 (signed documents live on our server).

## Log

- L1 (2026-11-21) User: "it says validity unknown and give me the pitch in a clean image like you know my boss understand better, and in spanish but start working on that Phase 1. Also mention about the domain (she probably dont understand what a domain is exactly but dont explain it on the proposal, just illustrate it in a way anyone can understand), no SMTP for now. Later after my boss approval we work on the migration to a new google cloud acocunt or we figure that part out later"
- L2 Phase 0 evidence (pilot server https://34-172-167-26.sslip.io, DocuSeal 3.3.7): consent and two-signer SOA signed end to end with prefilled locked fields; SOA templates 5/6 have the phones as 3 `cells` fields each and white-background dates; Acrobat shows "validity unknown" (self-signed certificate). Pilot scripts: `private/pilot/` (ignored).
- L4 (2026-11-21) User: "for the PR and merging pass the request through the session that created this one". User: "for the consents, unlike SOAs, everything should be filled before the client signs, just to clarify" (already the /send behaviour: Cliente fields go locked at creation).
- L5 T1–T3 in one commit: one file (`signing-helper.ps1`) rewritten around a new protocol, version 3. `/health` → `{ok, version, error: sin-clave|sin-servidor|null}`; `/send` `{templateId (digits), recipient:{name,email}, fields:[{name,value}], requester, meta:{kind,line,netKey,fileName}, agent?:{name, email?, dateField?, fields:[{name,value}]}}` → `{id, link}`; `/list` `{limit?}` → `{docs:[{id,status,saved,meta,agent,name,email,created,link?}], more}`, statuses sent/viewed/agent/completed/declined/expired; `/pdf`, `/saved`, `/delete`, `/agent` take `{id}` (digits). The page still speaks the old protocol until T5/T6. PowerShell 5.1 traps met: `@(json | ConvertFrom-Json)` nests a list; an empty array returned from a function arrives as `$null` (needs `return , @(...)`).
- L6 Native review: 58203eb (helper, escalated item 2) granted; risk, resilience and reliability lenses, 0 findings, approved and acknowledged (lineage review-6b4606d4c6cb0ae3). f5d033f (installer, escalated item 5) granted; risk and resilience, 0 findings, approved and acknowledged (lineage review-98b4d738e1e76c55). Reviewed boundary: f5d033f. Phase 1 (helper + installer) is done; T5–T7 are the toolbox side (Phase 2 of the plan) and the real-server check, which needs the support person to type the token.
- L3 Large: several sessions, and the real-server check needs the support person to type the token. Map of the SignWell code done (helper endpoints, Firmas, tests); `tests/helper.test.js` runs the helper against a fake provider via `-ApiBase`, so the fake becomes a fake DocuSeal.
