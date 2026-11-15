# Obamacare tab polish

Objective: Hogar fields and Cambios in the note, FOLLOW UP DOCS rule, bilingual SMS and a two-part client email for Obamacare.
Branch: `obamacare`. Delivery: single-pr (obamacare -> main, user's per-tab branch workflow). Test runner: `npm test` (node:test), then `npm run build`.

## Specs

S1. Hogar: remove the dependent checkbox. User: "eliminate the "Es dependiente: está dentro de la cobertura, no es el principal" checkbox from there. The note should always go inside the principals profile, at least in our current workflow, so it is unnecesary." Consequence: the automatic task no longer picks `FOLLOW UP CUSTOMER SERVICE DEP` (still available by hand).

S2. Hogar fields. User: "each person should also have fields available for: US status (citizen, resident, work permit, Something else (type)) and DOB. Also there should be an Address field on that section, as well as the principals phone number and email address."

S3. Cambios. User: "Any change in this section should be stated in the note as "Cambios:" then each change listed with a dash - below that". Clarified (L2): "Only the data is extracted from pdf files. For example if it detects everyone on a household and i change a dependent to No cobertura that goes into it".
Rule (assumption built from L2): a change is a Hogar value that differs from what the PDFs filled in (edited, cleared, toggled), a person added by hand to a household that came from a PDF, or a PDF person removed. Address, phone, email, US status and DOB count as soon as they are filled in where no PDF supplied them. Previous PDF value shown as "(antes X)". No PDF data at all: only those contact/status/DOB fields can appear. Not in Cancelación.

S4. Task. User: "The FOLLOW UP DOCS BY task name should remain the automatic task name if MKPL is asking for docs, even if they are checked as enviado since it needs a follow up. The date is the earliest from all the listed requested documents"

S5. SMS, Spanish and English. User: "Messages for customers can be in english and spanish with the following formats:"
```
Estimado [FIRST NAME]: Somos QAgency Insurance. Hemos renovado su seguro de salud 2027 con Florida Blue.
Plan: myBlue Essentials Silver 27M07-01C
Inicio: 01/01/2027
Premium: $85.40/mes
Revise su email y para cualquier duda, comuníquese de inmediato con nosotros. Saludos Eduardo Chinea
Directo: (239) 282-4226
Oficina: (239) 205-2047
? ¡Por cada 4 personas que nos refiera, gana una GIFT CARD!
```
```
Dear Miguel:
We are ATH Insurance. we have renewed your 2027 health insurance with Florida Blue.
Plan: myBlue Bronze 2129
Start: 01/01/2027
Premium: $850.58/month
Please check your email and, if you have any questions, contact us right away. Best regards
Eduardo Chinea
Direct: (239) 282-4226
Office: (239) 205-2047
? For every 4 people you refer to us, you get a GIFT CARD!
```
Assumptions: applies to Obamacare App enviada (other OC outcomes keep their current SMS); "?" is a lost emoji, use 🎁; "we" capitalized; Estimado/Estimada from el/la cliente; signer = who talked to the client (default: note author), direct phone from a new per-person setting, office phone from the existing office setting; QAgency shows as "QAgency Insurance". Action sentence per Tipo de gestión (renewal text is the user's; new and life change are assumptions).

S6. Email, two parts with a copy button each. User: "Below the SMS section, there should also be an email section to replace the following text formats (2 separate sections with a COPY button in each):"
```
<>Section 1 Spanish
Estimado Cliente:
Adjunto documentos por su póliza del 2027 con ......., ya la aplicación fue completada.
Cobertura a partir del MM/DD/YYYY
PLAN:
Adjuntamos detalles de beneficios del plan
Prima Mensual: $0.00

<>Section 1 English
Dear Client:
Attached are documents for your 2026 policy with ........, your application is complete.
Effective date: MM/DD/YY
PLAN:
Attached is a detailed description of your benefits with this plan.
Primary Monthly Payment: $ 0.00

<>Section 2 Spanish
"MARKETPLACE SOLICITA:
Pruebas de Estatus Migratorio, fecha límite MM/DD/YYYY
Pruebas de Ingresos, fecha límite MM/DD/YYYY" -> Deleted if MKPL doesnt ask for docs

Por favor comuníquese con nosotros por cualquier duda.

Saludos
Agent -> The one who spole with the client

<>Section 2 English
"MARKETPLACE IS REQUESTING :
Proof of Citizenship Status, Due Date, MM/DD/YY
Proof Of Income, Due Date MM/DD/YY" -> Deleted if MKPL doesnt ask for docs

Please feel free to contact us, if you have any questions or concerns.

Best Regards,
Agent -> The one who spole with the client
```
Assumptions: same language toggle as the SMS; dates MM/DD/YYYY in both languages; lines with no value are left out; every requested doc is listed (sent or not, as in S4); first name added in parentheses when the requests are for more than one person.

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S3 | inline | done | 75360ed |
| T2 | S4 | inline | done | 75360ed |
| T3 | S5, S6 | inline | done | 75360ed |
| T4 | all: README, version 1.4.0, dist, browser check | inline | done | 75360ed (README, version), 555db0f (dist) |

Route evidence: one understood change per task, shared files (notes.js, app.js), no writer trigger. One feature commit (about 605 authored lines) because S1-S6 touch the same functions and lines in notes.js, app.js and config.js; splitting would need hand-built intermediate files.

## Log

L1 (2026-11-14, user, verbatim): Next changes (Obamacare tab): In the Hogar section, eliminate the "Es dependiente: está dentro de la cobertura, no es el principal" checkbox from there. The note should always go inside the principals profile, at least in our current workflow, so it is unnecesary. In the same section, each person should also have fields available for: US status (citizen, resident, work permit, Something else (type)) and DOB. Also there should be an Address field on that section, as well as the principals phone number and email address. Any change in this section should be stated in the note as "Cambios:" then each change listed with a dash - below that / The FOLLOW UP DOCS BY task name should remain the automatic task name if MKPL is asking for docs, even if they are checked as enviado since it needs a follow up. The date is the earliest from all the listed requested documents / Messages for customers can be in english and spanish with the following formats: (S5) / Below the SMS section, there should also be an email section to replace the following text formats (2 separate sections with a COPY button in each): (S6)

L2 (2026-11-14, user answer on how Cambios is detected, verbatim): "Only the data is extracted from pdf files. For example if it detects everyone on a household and i change a dependent to No cobertura that goes into it"

L3: Phone numbers from the examples are not hardcoded: the GitHub repo is public. Direct phone goes in Ajustes per person; office phone already exists in Ajustes.

L4 (2026-11-14, evidence): RED first: 8 failing tests (task rule, dependent, Cambios, SMS loop, SMS format, email, warnings, App Summary DOB/address). GREEN: `npm test` 52/52. `npm run build` regenerated dist. Browser check on a local server with the sample App Summary and My Plans text pasted: unchanged PDF data gives no Cambios; Ana to No cobertura gives "- Ana: no pide cobertura"; address edit shows "(antes ...)"; removing Ana and adding Maria give "Se quita"/"Se agrega"; a doc marked Enviado keeps FOLLOW UP DOCS BY FEB/12/2027; English switch changes SMS and both email parts; direct and office phones from Ajustes appear in the SMS; email Copiar works; 375 px width has no horizontal scroll; dist build shows the same. Test settings cleared from the preview browser afterwards.
Next: user review; push to origin/obamacare and merge to main are the user's decisions.
