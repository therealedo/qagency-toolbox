# Supplemental tab polish

Objective: simplify the Suplementario line to App enviada and Cotización, with a Members list like Obamacare and the client email.
Branch: `supplemental` (from main at 0cfd1f4). Delivery: single-pr (supplemental -> main). Test runner: `npm test`, then `npm run build`.

## Specs

S1. App enviada. User: "Clone Obamacare version of Cliente but renaming it to Members. Also eliminate income since is irrelevant. Only keep DOB. On the note only add their first names as people with coverage". The section is titled "Members" and takes the Obamacare address, phone, email and people list; each person keeps the Cobertura toggle and DOB only (no Taxes, relationship, US status or income). The note names the covered people by first name, with the titular as "el cliente"/"la cliente". Assumption: no "Cambios" block for Suplementario until the official note format arrives; DOB, address, phone and email are kept in the form but not in the note yet.

S2. App enviada. User: "In supplemental there's usually no plan change so eliminate that option. Eliminate the App ID (well only keep the Policy ID from the next section)". Tipo de gestión keeps Aplicación nueva and Renovación; the PDF reader stops filling App ID for supplemental applications.

S3. App enviada. User: "Eliminate Tipo de plan (well only keep Producto)"

S4. App enviada. User: "Leave only Pago confirmado and Pendiente the Pago as Pago options"

S5. App enviada. User: "Eliminate the Pendiente y proximo paso section"

S6. App enviada. User: "For agente y colaborador do the same as with MC" (no Colaborador; the note author processed the app; the section is titled "Agente").

S7. App enviada. User: "SMS and official note format same as MC, still pending, ill give it to you tomorrow" (saved in Engram as qagency/supp-formats-pending).

S8. App enviada. User: "Email format:"
```
Estimado CLIENTE

Se adjunta Aplicación al Plan: 
Compañía XXXX 
ID # 00000000 
Cobertura a partir del MM/DD/YY 
Prima Mensual: $00.00 
Le llegara por correo postal la póliza, beneficios.
Cualquier duda u observación se puede comunicar con nosotros.

Saludos,   
Agent
```
```
Dear Client

We attached the application for:
Company XXXX
ID # 00000000
Effective date: MM/DD/YY
Monthly Premium: $00.00
Please feel free to contact us, if you have any questions or concerns.

Best regards,   
Agent
```
Assumptions, following the Obamacare email the user confirmed: "Cliente"/"Client" stays literal, "Estimada" with la cliente; dates MM/DD/YYYY; lines with no value are left out; same Español/English switch; one part with one Copiar; signed by whoever talked to the client; ID # is the Policy #; the company is written as the client reads it (Florida Blue); "llegara" gets its accent ("llegará"); trailing spaces dropped.

S9. Cotización. User: "Do the same as with the previous tab with Cliente, Gestion sections. Eliminate the App ID and Policy ID options." / "Eliminate Tipo de plan and Fecha efectiva change it to Fecha efectiva estimada" / "Eliminate Pendiente y proximo paso". Assumptions: the note names covered people besides the titular ("desea cotizar seguro dental para el cliente y Maria.") and adds "Fecha efectiva estimada: MM/DD/YYYY".

S10. User: "Pago, Renovar Short Term and Cancelacion tabs, eliminate them". The FOLLOW UP RENEWAL SHORT TERM task stays in the Tasks tab.

S11. User: "I have still pending to give you sms official format and email format for quotes" (saved in the same Engram memory as S7).

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1-S7, S10 | inline | done | 4641ebc |
| T2 | S8 | inline | done | 4641ebc |
| T3 | S9 | inline | done | 4641ebc |
| T4 | all: README, version 1.6.0, dist, browser check | inline | done | 4641ebc, 269369f |

Route evidence: shared files (config.js, notes.js, app.js), one understood change, no writer trigger.

## Log

L1 (2026-11-15, user, verbatim): Create another branch for supplemental / App enviada / * Clone Obamacare version of Cliente but renaming it to Members. Also eliminate income since is irrelevant. Only keep DOB. On the note only add their first names as people with coverage / * In supplemental there's usually no plan change so eliminate that option. Eliminate the App ID (well only keep the Policy ID from the next section) / * Eliminate Tipo de plan (well only keep Producto) / * Leave only Pago confirmado and Pendiente the Pago as Pago options / * Eliminate the Pendiente y proximo paso section / * For agente y colaborador do the same as with MC / * SMS and official note format same as MC, still pending, ill give it to you tomorrow / * Email format: (S8) / Cotizacion tab: / * Do the same as with the previous tab with Cliente, Gestion sections. Eliminate the App ID and Policy ID options. / * Eliminate Tipo de plan and Fecha efectiva change it to Fecha efectiva estimada / * Eliminate Pendiente y proximo paso / Pago, Renovar Short Term and Cancelacion tabs, eliminate them / I have still pending to give you sms official format and email format for quotes

L2 (2026-11-15, evidence): RED first: 8 new or updated tests failed before the change. After it, `npm test` 56/56 pass and `npm run build` wrote dist for 1.6.0. Browser check on a local preview: the Suplementario situations are App enviada and Cotización; Tipo de gestión is Aplicación nueva and Renovación; the section is "Members" with address, phone, email and people that have only a Cobertura toggle and DOB; App ID, Tipo de plan, Colaborador, the Miembros text box and the follow-up section are gone; Pago offers Pago confirmado and Pendiente de pago; the section title is "Agente". App enviada note: `Se procesa app de Dental de FB, plan BlueDental Choice, para el cliente y Maria.` with Policy #, no App ID; report ends `(ER) +1`; the email card shows one part titled "Aplicación y póliza", ES and EN matched S8 with the company as Florida Blue; the SMS language switch stays hidden for Suplementario. Cotización: only Contacto, Members, Gestión and Plan; no App ID or Policy #; the label reads "Fecha efectiva estimada" and the note ends with `Fecha efectiva estimada: 12/01/2026`; no email card. Obamacare App enviada still shows the two-part email, both language switches, Colaborador and the Taxes toggles.

Next step: the user decides on pushing `supplemental` and merging it into main; the Suplementario SMS and note formats and the quote SMS and email are still pending from the user.
