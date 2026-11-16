# Change Sheet (Hoja de cambios) for OC Pendiente

Objective: a one-page summary a Collaborator uses to complete the application, printed or saved as PDF, on top of the note.
Branch: feat/change-sheet. Delivery: single PR. Runner: `node --test tests/*.test.js`.

## Specs

- S1 — "Like a summary that can be handed out eaither digital or printed to a Collaborator to complete the application (yes, on top of the note)". Printed from the browser; "digital" is the print dialog's Save as PDF, named like a Network file (`Barallobre Vazquez, Mary - OC_Change Sheet 2027`).
- S2 — "add that too on the Pendiente tab for OC".
- S3 — Content and layout follow the sample `Barallobre_Vazquez_Mary_-_OC_Change_Sheet_2027.pdf`: title "Hoja de cambios · Verificación previa", "Datos actualizados para {año}", date; the legend "Los datos resaltados indican cambios en relación con el proceso anterior ({año - 1})."; the banner "PROCESAR POR EL PORTAL: …"; Cliente (Apellido, Nombre), Código de Zoho, Agente, Colaborador, NPN ANTERIOR, NPN SELECCIONADO, CARTA DE CONSENTIMIENTO; Plan elegido (company · plan, PRIMA $/mo, INICIA COBERTURA); Datos de contacto (dirección, email, teléfono, idioma); Integrantes del hogar (Nombre, Nac. (DOB), Sexo, En taxes, Solicita cobertura, Estatus migratorio, Income anual estimado) and "Income anual estimado del hogar {año}"; footer "Uso interno · sin SSN".
- S4 — Highlighted = changed against the documents of the previous process (the same baseline as Cambios in the note).
- Assumptions: NPN ANTERIOR is the agent of the last document dropped (App Summary); INICIA COBERTURA is 01/01/{año} in OEP and empty otherwise; one language field (the app keeps one); a member's sex comes from the documents (the titular's from *el cliente / la cliente*).

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1-S4 | inline | done | 3 changeSheet tests; checked in the app (Pendiente, Review Page fixture, edited email/income, added member); print to PDF in headless Chrome: one Letter page, only the sheet, colors kept, selectable text |

## Log

- L1 (2026-11-16, user): "Also add the following feature based on the attached file: Like a summary that can be handed out eaither digital or printed to a Collaborator to complete the application (yes, on top of the note). Thats part of our system as well so please add that too on the Pendiente tab for OC"
- L2 (evidence): the sample PDF has no text layer (vector outlines); rendered with headless Chrome to read it. 239/239 tests. On Pendiente a previous-year document no longer replaces a newer plan year (found while checking: the 2026 App Summary turned the 2027 renewal into 2026).
