# Phase 1: faster workflow

Objective: build phase 1 of the approved proposal: copy-next and SMS/email links, a floating copy strip, saving PDFs to the Network folder chosen in the app, and offline OCR for scans and screenshots.
Branch: `phase1` (from main at 43a6bea). Delivery: work-unit commits on the branch, then push and merge when the user asks, as before. Test runner: `npm test`, then `npm run build`.

## Specs

S1. User: "start phase 1". Phase 1, as the user approved it in the proposal ("Propuesta: Q Agency Toolbox integrado al flujo de trabajo"), is "Ventana flotante", "Guardar en el Network", "Copiado en secuencia" and "Lectura de escaneos", requiring "Nada" (no permissions, no cost, offline).

S2. Copiado en secuencia. Proposal: "Un atajo copia la nota, el task y el reporte en orden; el SMS y el email abren el teléfono o el correo con el texto listo". Assumptions: a "Copiar siguiente" button in the dock plus a keyboard shortcut; the order is note, task, report, SMS, then email, skipping what the situation hides or leaves empty; it starts again with the note after a field changes. The SMS opens with an `sms:` link to the titular's phone and the email with a `mailto:` link to the titular's email, when those fields have a value.

S3. Ventana flotante. Proposal: "Botones de Nota, Task, Reporte, SMS y Email siempre encima de Zoho, sin cambiar de ventana". Assumptions: Document Picture-in-Picture in Chrome/Edge; the button does not show where the browser cannot open one; the window always copies the current text, including hand edits.

S4. Guardar en el Network. Proposal: "Se elige la carpeta una vez y cada PDF se guarda con su nombre correcto". User: "The save to network should be setup from the application". Assumptions: the folder is chosen in Ajustes (the agent's own folder in the NETW, as in "Docs en mi folder del NETW"), and files are saved directly in it with the generated name plus the original extension. Each Network row whose document was dropped gets a Guardar button, plus "Guardar todo". Saving ticks the document, as copying its name does. An existing file with the same name is overwritten only after confirmation. Where the browser has no folder access, the feature is hidden with a note.

S5. Lectura de escaneos. Proposal: "Llena los datos de PDF escaneados y capturas de pantalla". User: "we will need that Offline OCR". Assumptions: Spanish and English; no network requests (the CSP may allow only local sources); images can be dropped or pasted with Ctrl + V; scanned PDF pages are rendered with PDF.js and read; the text goes through the same extraction as a text PDF, and the agent reviews the fields as always.

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| T1 | S2 | inline | done | 2ca14f7 |
| T2 | S3 | inline | done | 2ca14f7 |
| T3 | S4 | inline | done | 2ca14f7, README aefb8c6 |
| T4 | S5 | inline after a background packaging spike | done | 40b0177, fixes cccb79b |
| T5 | all: README, version 1.7.0, dist, browser check | inline | done | 40b0177, dist ad78c95 and c9e6fe0 |

Route evidence: T1 to T3 share app.js, index.html and css (not disjoint), so inline. T4 depends on how Tesseract.js can run under file:// and the CSP; a read-only spike investigates it in a scratch directory first.
Risk: T3 item 1 (it can overwrite a file in the Network folder; guarded by confirmation). T4 items 2 and 5 (CSP change and a new vendored dependency).

## Log

L1 (2026-11-15, user, verbatim): start phase 1. The save to network should be setup from the application and we will need that Offline OCR
L2 (2026-11-15, T1-T3): copyOrder, smsLink, mailtoLink and safeFileName in notes.js with RED/GREEN tests; the Copiar siguiente button, Ctrl + Shift + Enter, the floating window and the Network folder in Ajustes in app.js. Browser check on localhost: copy order per situation, links shown only with a phone or email, saving to a folder (OPFS stand-in) with the generated name, ticking the document and asking before replacing. The embedded pane refuses Document Picture-in-Picture and the real folder picker cannot be automated: both still need a check in Chrome or Edge on the agent's PC. Assess 2ca14f7: medium, under_budget.

L3 (2026-11-15, T4 spike): tesseract.js-core 7.0.0 driven directly in a Blob worker, with the gzipped WebAssembly and the spa/eng tessdata_best int models inlined as base64 scripts. The only CSP change is 'wasm-unsafe-eval'; connect-src stays 'none'. Needs WebAssembly SIMD (Chrome/Edge 91+). The single file grows from 1.9 MB to about 10 MB.

L4 (2026-11-15, T4): js/ocr.js with tools/vendor-ocr.js generating vendor/tesseract/. Evidence: PSM 3 split a two-column form into a labels block and a values block, so page mode 4 (single column) is used; plain OCR text collapsed wide gaps to one space and the SOA name ran into the next label, so lines are rebuilt from word positions (TSV) with wide gaps kept as three spaces and stray dashes dropped. RED then GREEN in tests/ocr.test.js: an English SOA scan and a Spanish two-column screenshot give the same fields as the text fixtures. tests/package.test.js pins the CSP. PDF.js rendering stalled with the pane hidden (requestAnimationFrame); rendering with intent print fixed it, which also keeps OCR going in a background tab. Assumption: at most 6 pages of a scanned PDF are read.

L5 (2026-11-15, T5): README sections for scans and screenshots, privacy and layout; version 1.7.0; npm test 64/64; dist 9,941 KB HTML and 6,685 KB zip. Browser check on localhost: screenshot (5 fields, about 4 s including the first start), scanned PDF built in the page (Aplicación de Medicare, 6 fields, about 5 s), Ctrl + V paste (Comprobante de pago, 2 fields), a text paste is left alone, and an unsupported browser shows the manual-entry message. dist/QAgency-Toolbox.html opened from disk (file://) in headless Edge: both read, and the only requests were file:, data: and the blob: worker.

L6 (2026-11-15, independent verifier, items 2 and 5): S1-S5 met (S3 and S4 not checked on a real desktop). The CSP in the build equals index.html; fetch and importScripts are refused inside the Blob worker as on the page; 'wasm-unsafe-eval' does not allow eval. tools/vendor-ocr.js regenerates all vendor files byte-identical from the lockfile-pinned packages; licenses match NOTICE. Baseline tests pass against HEAD; 24 text-PDF cases give identical outputs at baseline and HEAD with OCR never used. Blocker B1 (conditional): a paste into a field whose clipboard has text and an image (Excel cells) was taken over by OCR. Advisories: A1 two jobs during engine start both failed; A2 stale copy-next label after Copiado; A3 SMS/email links not reachable with Tab; A4 non-image files called Imagen; A5 vendor script does not pin the version; A6 out-of-domain worker failures.

L7 (2026-11-15, correction batch, cccb79b): B1 a text paste into a field stays a text paste; A1 the worker queues jobs; A2, A3 and A4 fixed; A5 and A6 left as advisories. Found during the recheck: a one-line screenshot was reported as empty because OCR results used the 40-character scanned-PDF rule; OCR results now count with any text (4 or more characters). Recheck in the browser: the text paste is not intercepted, a cold back-to-back pair both read, the short screenshot fills 2 fields, a blank image says no text, a .docx says it is not read. npm test 64/64; dist rebuilt (c9e6fe0).

L8 (2026-11-15, native review): slice 43a6bea..aefb8c6 (T1-T3 and README) assessed medium, not due; boundary closed at aefb8c6. OCR unit aefb8c6..c9e6fe0 assessed high (items 2 and 5 escalated), review due; the user granted the review with lenses risk, resilience and reliability. All three reviewer captures failed twice with lens_context_inspection_failed (provider-owned reviewer lens context was not produced, gentle-ai 4.4.0) after a STATUS that reoffered the same slots. The user chose to continue without reporting it; the review was declined for this candidate and STATUS returned to preflight. Outcome: native review unavailable; proof for items 2 and 5 rests on the independent verifier (L6) and the recheck (L7).
