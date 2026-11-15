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
| T1 | S2 | inline | pending | |
| T2 | S3 | inline | pending | |
| T3 | S4 | inline | pending | |
| T4 | S5 | inline after a background packaging spike | pending | |
| T5 | all: README, version 1.7.0, dist, browser check | inline | pending | |

Route evidence: T1 to T3 share app.js, index.html and css (not disjoint), so inline. T4 depends on how Tesseract.js can run under file:// and the CSP; a read-only spike investigates it in a scratch directory first.
Risk: T3 item 1 (it can overwrite a file in the Network folder; guarded by confirmation). T4 items 2 and 5 (CSP change and a new vendored dependency).

## Log

L1 (2026-11-15, user, verbatim): start phase 1. The save to network should be setup from the application and we will need that Offline OCR
