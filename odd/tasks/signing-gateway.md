# Signing gateway (the DocuSeal key lives only on the server)

Objective: no computer holds the DocuSeal API key. A gateway on the signing server adds it to the helper's requests when they carry a valid office code, and the codes travel in the team file.
Branch: `feat/signing-gateway` from `origin/main` (4334612, 1.25.0). Delivery: work-unit commits on this branch; push, PR, merge and the release (dist signing) go through the parent session. Test runner: `node --test tests/*.test.js`.

## Specs

- S1 Gateway on the pilot server (`https://34-172-167-26.sslip.io`) in front of DocuSeal, built by the startup script of `tools/docuseal/crear-servidor.sh` (Caddyfile). It holds the DocuSeal API key, which the user types on the server; the agent never sees or handles it. It allows only the methods and paths the helper uses, and only with a valid office code (one for QAgency, one for ATH). It strips the code and adds `X-Auth-Token` before forwarding. Requests without a code pass through unchanged (1.25.0 computers keep working). Carried constraint: "Never handle the user's credentials or tokens."
- S2 No secrets in the package or the repo: updates download anonymously from raw.githubusercontent.com. The server address is built into the helper. The office code travels in the team file `QAgency-Equipo.json`, imported once per computer in Ajustes. The codes are generated on the server by a command the user runs; the user types them into Ajustes and exports the team file.
- S3 The per-computer key prompt and "Clave de firma.bat" are removed. Computers upgrading from 1.25.0 that hold a DPAPI key (`firma\clave.txt`) and `firma\ajustes.json` get them deleted, without breaking.
- S4 Any remote operation on the server is authorized by the user first (destination, operation, credential).
- S5 Fake data only; README and LEEME updated; tests added; report back to the parent for the release. The next release is ≥ 1.25.1. Carried constraints: "Use SignWell only with fake data" (applies to DocuSeal); "Never commit private/ (team file, signing key) or raw sample PDFs."
- S6 Answer the user: "tell me when can I make the repo private?"

## Tasks

- T1 S2, S3: helper protocol v4 (`X-Office-Code`, `sin-codigo` 400, gateway `codigo` 403, built-in server), installer without the key prompt and deleting the 1.25.0 key files, `Clave de firma.bat` removed; page sends the code (Ajustes inputs per office, team file import/export, messages). Route: inline. Status: done, see commit log.
- T2 S1, S2: gateway in the startup script (Caddyfile, `pasarela.env`), re-run of `crear-servidor.sh` sends the key over IAP SSH by stdin, makes the codes on the server, `--codigos-nuevos`. Route: inline. Status: done; static and bash tests GREEN; live Caddy check pending (needs Docker or the user's authorization on the server).
- T3 S5: README, LEEME, version 1.25.1. Route: inline. Status: done.
- T4 S6: answer about making the repo private. Status: in the report to the parent.

## Log

- L1 (2026-11-21, user, relayed by the parent session): "Okay, I want this to be as seamless as possible for agents, because I probably won't be able to set up all that quickly for all machines, since we are both in two agencies, and if anything changes, we have to update everything. So uh, I know we can set it up the API key on Google Cloud, and then it can be updated for all machines. Now, in order to do that and to be safe, we have to make the repo private. So making the repo private, how will that affect coming updates, like the update process and everything we have been doing so far, if we do it private?"
- L2 (2026-11-21, user, relayed): "Yes, please, and tell me when can I make the repo private?"
- L3 Design from the parent: gateway with Caddy matchers or a tiny service; office code per office in the team file; built-in server; no secrets in package or repo; remove the key prompt and `Clave de firma.bat`; handle 1.25.0 upgrades; ask before remote operations; ≥ 1.25.1; PR and merge through the parent.
- L4 Decisions: the gateway is a Caddyfile written by the startup script on every boot (the metadata startup script already rewrites `.env` and `docker-compose.yml`), with the secrets in `/srv/docuseal/pasarela.env`, which the startup script never writes. The gateway block is written only when the key and two different codes validate; otherwise a coded request gets `503 {"error":"pasarela"}`. The key and codes are literal in the Caddyfile (mode 600, root) instead of Caddy env placeholders, so nothing depends on compose `env_file`. One script, `crear-servidor.sh`, instead of a second one: re-running it pushes the new startup script to the existing VM (`add-metadata`) and then asks for the key, so the user runs a single command. The key goes to the server through the stdin of `gcloud compute ssh --tunnel-through-iap … sudo bash -s`, never on a command line or in a Cloud Shell file. The codes are 40 hex characters from `/dev/urandom` (`od`, no SIGPIPE under `pipefail`).
- L5 Evidence: full suite 314/0; `tests/server.test.js` runs the gateway step in bash with fake values (allowed routes match every helper call, wrong methods and paths are refused, invalid env gives 503 and no key). Browser end-to-end with fake data (copy of the app, real helper, fake DocuSeal, headless Edge): without a code, no request goes out and the page says "Falta el código de firma de la oficina…"; after typing the code in Ajustes (password input), Consent and SOA links are created, Firmas lists them, the agent signs; 12 API calls, all with the code and no key; 2 file downloads, none with the code.
- L6 Next: live check of the Caddyfile with Caddy 2.11.9 (validate and route behavior), then an independent verifier (Risk items 2 and 5), then the report to the parent.
