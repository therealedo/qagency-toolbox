# Official file names, carriers and document readers

Objective: name Network files with the agency's official formats, use the official carrier lists, drop the Writing ID, and make the document reader handle the agency's real sample documents.
Branch: `feat/official-names-readers` from main `465ae96`. Delivery: work-unit commits on the branch; push and merge are the user's decision. Version 1.9.0.
Test runner: `node --test tests/*.test.js`. Sample harness: headless Chrome running the Toolbox's own `pdfToText` + `extract` (see Log L3).

## Specs

S1. File names. User: "Official file format names:
* App Summary (OC): Lastname, Firstname OptionalMiddleName - OC_App Summary 2027
* Consent (OC): Lastname, Firstname OptionalMiddleName - OC_Consent Ambetter 2026 NOV
* Eligibility letter (OC): Lastname, Firstname OptionalMiddleName - OC_EligibilityNotice 2027
* My Plans and programs (OC): Lastname, Firstname OptionalMiddleName - OC_My Plans & Programs Ambetter 2027 JAN
* Cancelled OC: Lastname, Firstname OptionalMiddleName - OC_My Plans & Programs Ambetter 2027 JAN CANCELLED  (when coverage doesnt start, like in a renewal for next year or an application made but cancelled before the effective date or after the effective date  without payment if the client calls to cancel)
* Terminated OC: Lastname, Firstname OptionalMiddleName - OC_My Plans & Programs Ambetter 2027 JAN TERMINATED (when we terminate the coverage in certain month, like when transitioning to medicare or insurance through a job)
* Docs submitted (OC): Lastname, Firstname OptionalMiddleName - OC_Docs Submitted_Immigration status 2026 NOV
* Docs submitted (OC - dependent/spouse - not principal): Lastname, Firstname OptionalMiddleName - OC_Docs Submitted_DEPENDENT/SPOUSEFIRSTNAME_Immigration status 2026 NOV
* App MC: Lastname, Firstname OptionalMiddleName - Medicare_Humana_App 2027 JAN
* SOA(MC - App done/change done): Lastname, Firstname OptionalMiddleName - Medicare_Humana_SOA 2026 NOV
* SOA(MC - no change): Lastname, Firstname OptionalMiddleName - Medicare_SOA 2026 NOV
* App (Supp): Lastname, Firstname OptionalMiddleName - Accident/Hospital/Dental/etc_Allstate 2027 JAN
* Payment confirmation (OC/Supp):  Lastname, Firstname OptionalMiddleName - Payment Confirmation - Dental/OC/etc_FB 2026 JUL"
Assumptions (to confirm with the user):
- A1. CANCELLED uses the coverage start month (effective date).
- A2. TERMINATED uses the month coverage ends, from a new termination date.
- A3. Consent and SOA keep the signature or note month. Payment keeps the payment month. App Summary and Eligibility use the plan year.
- A4. The Supp ID card entry ("{product}_{carrier} - CARD") stays, because it was not in the list and the user did not ask to remove it.

S2. OC carriers. User: "OC: Florida Blue (FB in file names and reports), Ambetter, Wellpoint, UHC, Oscar, Cigna, Other (with a field to write)".

S3. MC carriers. User: "MC: Humana, UHC, Aetna, Florida Blue (FB in file names and reports), BCBS of ESTATE(two letters), Healthspring, Devoted, Freedom, Simply, Other (with a field to write)".
- A5. "BCBS of" takes a 2-letter state, and its file and report form is "BCBS of XX".
- A6. Supp keeps its current carrier list, because no official Supp list was given.

S4. Agent ID. User: "We dont need writing ID, with NPN is enough".

S5. Readers. The user sent sample documents. In the user's words, "Disregard real name ... or wrongly named file names (these were like that before  but i want to use our new standard)". Acceptance: each sample is detected as the right document type, without relying on its file name, and its main fields are read. Main fields: client name, carrier, product or plan, effective date, premium, and the IDs each document shows. A field label must never be read as a value.
- MC apps: Humana, UHC, Aetna, Freedom, Devoted.
- OC: My Plans & Programs, App Summary (scan), Eligibility Notice, Docs Submitted (principal and dependent).
- Supp apps: 4 Golden Rule (Hospital, Short Term), 2 Allstate Accident, and Dental apps from FB, Cigna, Humana and Allstate.
- Supp ID card: Allstate, a scan.
- Payment confirmations: OC Oscar, UHC, Wellpoint and Ambetter; Supp GeoBlue and Dental FB.
- Privacy: test fixtures are text excerpts. Every ID number (MBI, Medicaid, App ID, policy, confirmation, phone, email, address) is replaced with a fictitious value of the same format. The raw PDFs are never committed.

S6. Consent form on the OC tab. User: "Also these are the editable Consent pdf forms. For now, embed a section on the OC tab to automatically fill up the pdf with the data when quoting and a text field with the format i gave you before with the @ at the end to mention in Zoho cliq". The format given before: "Enviar SOA a XYZ al [email] y al [phone] pls @Support QAgency" or "enviar CONSENT a....".
- Templates: Consent_2027_QA_Eng, Consentimiento_2027_QA_Spa, Consent_2027_ATH_Eng and Consentimiento_2027_ATH_Spa. All are AcroForm.
- The template is chosen by the agent's office (QA = "QAgency", ATH = "ATH Insurance") and by the client's language.
- Field names differ per template (see L5).
- The signature fields ("Signature1_es_:signer:signature", "Firma", "Fecha de la Firma") stay empty.
- The section shows the values to fill (prefilled from the quote, editable), a button that downloads the filled PDF, and the Cliq text with a copy button.
- Assumptions:
  - A7. The section appears in the OC outcome "pendiente" (Cotización).
  - A8. The downloaded PDF is named with the S1 Consent format.
  - A9. The Cliq text is "Enviar CONSENT a <Nombre Apellido> al <email> y al <phone> pls @Support QAgency". It drops the "al <email>" or "al <phone>" part when that value is missing, and uses "@Support QAgency" for both offices.
  - A10. The templates are bundled offline in the app, so agents need no setup. This adds about 7 MB.
  - A11. Filling uses the vendored PDF.js (annotationStorage plus saveDocument), so no new dependency.

S7. SOA form on the MC tab. User: "Ill give you the SOAs Next". Templates: SOA_Spanish_Agency (AcroForm: 5 product checkboxes and text fields) and SOA_English_Agency (no fillable fields; its widgets were removed).
- Assumptions:
  - A12. Same section pattern as S6, on the MC tab, with "Enviar SOA a ..." as the Cliq text.
  - A13 (resolved, L7). The user has no fillable English SOA. A one-time script, tools/make-fillable-soa.js using pdf-lib from a temporary install that the user approved, adds text fields to SOA_English_Agency at the positions of its blanks. The fillable result ships with the app. The 5 product boxes are left checked as they are in both SOAs; none is unchecked or changed.

S8. Signing-link test. User: "Can we build that cheapest Signatures solution to test it out and see how it work before proposing it to my boss? Will I have to pay anything?"
- The S6/S7 section gains a "Send signing link" option. Ajustes stores a SignWell Template Link URL per form, language and office.
- The Toolbox appends the prefill query parameters (field API IDs defined by us; see the list the writer produces) and builds the SMS and email text with the link.
- SOA (L14): "only allow the client to sign in the SOAs, the agent will sign later, after we get it signed by the customer". The SignWell SOA template has only the client's signature and date, and the SOA link carries no parameters.
- SOA (L16): the downloaded SOA is not filled (its whole agent section stays blank for the agent); in SignWell, the client date and the appointment date ("Fecha en que se realizará la cita") are both locked to the signing date.
- It makes no network call, so connect-src stays none.
- The SignWell side is set up by the user: 7-day trial of paid features, then Free. Test data only, because there is no BAA on the trial or Free plan.

S9. Official MC and Supp SMS. User (verbatim; the client's policy number and the phone numbers are redacted here, nothing else changed):
```
MC Official SMS text message
Estimado XYZ:
Somos ATH Insurance. Le confirmamos que su inscripción en Medicare para el 2027 se ha completado con éxito.
Compañía: Humana
Plan: Gold Plus - Diabetes and Heart (HMO C-SNP) H1036-311-000
Fecha de efectividad: 01/01/2027
Para cualquier duda, comuníquese de inmediato con nosotros. Saludos
Eduardo Chinea R
Directo: (239) [redacted]
Oficina: (239) [redacted]

Supp Official SMS text message
Estimada Aleida:
Somos ATH Insurance. Hemos completado la solicitud de su seguro de Hospital con Golden Rule
Plan: AdvantageGuard Hospital
Inicio: 01/01/2027
Premium: $78.03/mes
Policy #: [redacted]
Detalles en tu email. Si tienes dudas, llámame de inmediato. Saludos
Eduardo Chinea
Directo: (239) [redacted]
Oficina: (239) [redacted]

Just make the agency name swappable and translate it to an english version too
```
English version (drafted by us, as asked):
```
Dear XYZ:
We are ATH Insurance. We confirm that your 2027 Medicare enrollment has been completed successfully.
Company: Humana
Plan: Gold Plus - Diabetes and Heart (HMO C-SNP) H1036-311-000
Effective date: 01/01/2027
If you have any questions, contact us right away. Regards
<signer>
Direct: <signer phone>
Office: <office phone>

Dear Aleida:
We are ATH Insurance. We have completed the application for your hospital insurance with Golden Rule
Plan: AdvantageGuard Hospital
Start: 01/01/2027
Premium: $78.03/month
Policy #: <policy>
Details in your email. If you have any questions, call me right away. Regards
<signer>
Direct: <signer phone>
Office: <office phone>
```
Assumptions:
- A14. These texts replace the SMS of the "enviada" outcome on MC and Supp. Other outcomes keep the current SMS.
- A15. Same sources as the OC SMS: agency = office name (C.OFFICE_NAMES, from the Ajustes office), Estimado/Estimada from the gender field, signer = who talked to the client, Directo = signer phone, Oficina = office phone from Ajustes. No gift-card line (the official texts have none).
- A16. The SMS card's Español/English switch shows for MC and Supp sent apps too.
- A17. A line with no value is dropped. MC year: plan year, else the effective date's year, else no year.
- A18. The Supp product phrase uses the existing sms label ("seguro de hospital"); English labels are added to the Supp products.
- Correction (L11): the Supp Spanish text uses "usted" throughout, so its closing line is "Detalles en su email. Si tiene dudas, llámeme de inmediato. Saludos".

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1 (except Docs Submitted), S2, S3, S4 (form and note) | delegated (context backstop), parallel with T2 | done: notes+util+package 64/64; assess medium, under_budget | 6a0729f |
| T2 | S5 MC apps, S4 (reader) | delegated (context backstop), parallel with T1 | done: extract 22/22; fixtures anonymized; assess (T1+T2 slice) medium, under_budget | 89ac73e |
| T3 | S5 OC docs, S1 Docs Submitted end to end | delegated (context backstop), after T4 and T6 | done: extract 71/71, notes 59/59, full suite 170/170; differential 180 fixture runs 0 diffs; leak check clean. Risk item 3 (networkOf, mergeDocs) → independent verifier: S1 FAIL (B1, B2: a principal's file named as a dependent's), the rest PASS; correction dae41ab, recheck PASS, notes 60/60, full suite 171/171. Native review of 21f7d04..dae41ab approved and acknowledged (lineage review-7f239d6bbe732d0c) | 5c56679, 3ea34ef, dae41ab |
| T4 | S5 Supp apps, ID card, payments | delegated (context backstop), relaunched, parallel with T6 (disjoint surfaces: js/extract.js, tests/extract.test.js, tests/fixtures/); parent added 2 Supp carrier aliases and the short-text OCR trigger | done: extract 59/59, full suite 151/151, fixture leak check clean | 21f7d04 |
| T6 | S6, S7, S8 | delegated (context backstop), relaunched after T7, parallel with T4; correction inline | verifier: S6 FAIL (B1 blank Fecha in Chrome), S7 and S8 PASS. Correction 31d2c3d: forms 23/23, full suite 154/154; B1 recheck PASS (Chrome shows the date on both pages). Native review consent granted, then unavailable: lens_context_budget_exceeded (the 7.2 MB bundled templates). 31d2c3d alone: medium, under_budget | f4675e6, 31d2c3d |
| T7 | S9 | inline, before T6 (same files: js/notes.js, js/app.js, js/config.js, tests/notes.test.js) | done: notes 54/54, full suite 92/92; browser check of the switch deferred to T5; assess slice medium, under_budget | c1fe803 |
| T5 | Version 1.9.0, dist, README check, full suite, browser check | inline | done: version 1.9.0, dist 17,802,491 bytes and the Windows zip 12,076,778; full suite 171/171; browser check of dist PASS (see L21) | 8db4325, 97961ae |

## Log

L1 (2026-11-15, user, verbatim): "Im now on the office
Official file format names: [see S1]
Carriers: [see S2, S3]
Attachments OC (next message since you only allow 5 attachment per message): My plan and Programs, App Summary, Eligibility letter, Docs sumbitted (principal), Docs sumbitted (spouse/dependent)
MC (this message): App Humana, App UHC, App Aetna, App Freedom, App Devoted
We dont need writing ID, with NPN is enough
I'll give you the rest later"

L2 (2026-11-15, user, verbatim): "Disregard real name (these, the ones i didnt draw on were changed with another software and baked liek they were real) or wrongly named file names (these were like that before  but i want to use our new standard)". Later: "Ok I think these are enough".

L3 (2026-11-15) Baseline. The harness ran on the current code:
- Supp apps detected as "consent", 0 fields: Golden Rule x4, Dental FB.
- Allstate Dental app detected as oc_elig.
- Allstate Accident: carrier "GUARDIAN", product "Hospital".
- Docs Submitted detected as My Plans.
- Humana and UHC MC: the effective date is taken from Part A.
- PCP picks up label text.
- Freedom: no MBI, Parts or plan.
- Devoted: little text.
- App Summary and Allstate card: scans, with 0 to 49 chars of text.
- My Plans: the plan is read as "Communication".
- Eligibility: only appId and docs.
- Payments: dates, amounts and confirmations are partly missing, and the Dental FB payment is detected as supp_app.
Harness: `scratchpad/harness/build.js <repo> <samplesDir> <out.html>`, then `chrome --headless=new --allow-file-access-from-files --virtual-time-budget=60000 --dump-dom <out.html>`. Extracted texts are saved next to each sample.

L4 (2026-11-15, user, verbatim): "Also these are the editable Consent pdf forms. For now, embed a section on the OC tab to automatically fill up the pdf with the data when quoting and a text field with the format i gave you before with the @ at the end to mention in Zoho cliq, lets do that while I get permission for the Signatures solution
Ill give you the SOAs Next". Then the user sent SOA_English_Agency.pdf and SOA_Spanish_Agency.pdf.

L5 (2026-11-15) Template fields, read with PDF.js 3.11.174 getFieldObjects. The templates are copied to scratchpad/consent-templates/, and the field dump is in fields.json there.
- Consent Eng (QA and ATH):
  - "Todays Date": top date;
  - "Ms": client name;
  - "agentsEnes on the date of": consent date;
  - "Agents andor Enes": agent;
  - "NPN_2";
  - "Marital status";
  - "Projected Annual Family Income";
  - "Number of people on your 2023 tax return";
  - "People with medical coverage";
  - "Health Plan";
  - "Premium" (ATH) or "PREMIUM" (QA);
  - "Full Name": the name on the signature line;
  - "Signature1/2_es_:signer:signature": left empty;
  - "Fecha": page 2.
- Consent Spa (QA and ATH):
  - "Fecha": top date and page 2 (a shared name);
  - "Yo SrSra";
  - "mencionados a connuación en la fecha de";
  - "Agentes yo Endades";
  - "NPN";
  - "Estatus marital";
  - "Ingreso proyectado anual familiar";
  - "Candad de personas en su declaración de impuestos 2023";
  - "Personas con cobertura médica";
  - "Plan";
  - "Pago" (ATH) or "Premium" (QA);
  - "Nombre y Apellido";
  - "Firma" and "Fecha de la Firma": left empty.
- SOA Spa:
  - checkboxes (all with export value "On"): "Planes Medicare Advantage Parte C y Planes de Costos", "Plan Independiente para Medicamentos con Receta de", "Productos del Complemento de Medicare Medigap", "Productos dentalesde la vista", "Productos de indemnización";
  - text fields: "Nombre nombre y apellidos" and "Relación con el beneficiario" (representative only, left empty), "Nombre del Representante de Ventas con Licencia nombre y apellidos", "ID del Representante de Ventas con Licencia" (the NPN, per S4), "Nombre del beneficiario nombre y apellidos", "Teléfono del beneficiario", "Método de contacto inicial", "Planes que el Representante de Ventas con Licencia explicará durante la reunión";
  - signature fields left empty.
- SOA Eng: 0 widgets, not fillable.

L6 (2026-11-15, user, verbatim): "Can we build that cheapest Signatures solution to test it out and see how it work before proposing it to my boss? Will I have to pay anything?"
SignWell pricing page, checked 2026-11-15:
- Free plan: 1 sender, 1 template, 3 documents a month. No Template Links, no SMS. Multiple languages included.
- "New business accounts receive a 7-day trial of paid features."

L7 (2026-11-15, user, verbatim): "No i dont have an editable one". Then: "I also signed up for SignWell, email me or give me instructions so you can work on it". Then: "yes download it, and leave all 5 boxes checked as they are please" (approving the pdf-lib download).

L8 (2026-11-15) T1 delivered:
- Covered: S1 except Docs Submitted, S2, S3, S4 (form and note), A1–A6.
- Writer decisions: "Otra" label; MC CIGNA alone stays non-official; quoted-plan company stays free text; a warning for Terminada without a date. The Terminated note and report wording are unchanged (the report still says _Cancelled), which needs the user to decide.
- Parent spot check: notes+util+package 64/64.
- Commit 6a0729f. Review assess (base 465ae96, committed-only, untracked excluded): medium, review_due false, under_budget.
- T6 launched in parallel with T2.

L9 (2026-11-15) T2 delivered:
- Covered: S5 for the five MC apps (Aetna, Devoted, Freedom, Humana, UHC) and S4 in the reader (escritura removed).
- New helpers in js/extract.js: afterFirst, vDoctor, vPlan, vId, vPeriod, periodsIn, mcPeriod, mcAgent. Fixtures "tests/fixtures/Medicare App {Aetna,Devoted,Freedom,Humana,UHC}.txt"; the parent checked them for real IDs and names.
- Parent spot check: extract 22/22.
- Commit 89ac73e. Review assess (base 465ae96, committed-only, untracked excluded): medium, review_due false, under_budget (T1+T2 slice).
- T4 moved ahead of T3 and launched in parallel with T6; T3 runs after both, since it also edits js/extract.js.

L10 (2026-11-15, user, verbatim): "i was also checking signwell pricing but it is not $20/mo. And we will need the $36 a month plan cause we have 4 OC templates and 2 SOA templates". Then: "OH now i get it, $12 a month per sender". Then: "remember the pitch should be in spanish!"
- Pricing: SignWell Light is $12 per sender a month month to month ($10 billed yearly), 5 templates per sender. Two seats, one per office with 3 templates each, hold the 6 templates, so Business ($36) is not needed.
- The pitch is now in Spanish at reports/Propuesta firma SOA y Consent.png ($24 al mes, $20 con pago anual); the English image was removed.

L11 (2026-11-15, user): official MC and Supp SMS texts (S9). Asked whether to keep the Supp text's mix of "usted" and "tú", the user said (verbatim): "Usted is better". S9 updated; T7 queued after T6.

L12 (2026-11-15) Incident and recovery. User (verbatim): "You sure you're working I don't see any working agents". Checked: the background writers for T6 and T4 had stopped at about 17:07, when the parent's context was compacted, and wrote nothing to the repo (git status clean, scratch folders t4/t6 abandoned). The parent had relayed a stale "still running" status without checking. Recovery: T4 relaunched; T7 done inline (RED 3 failing → GREEN 54/54, full suite 92/92), commit c1fe803; T6 relaunched after T7 with the same scope. Check agent liveness through repo changes, not through status notes.

L13 (2026-11-15) T6 and T4 delivered.
- T6 (f4675e6): js/forms.js + 6 bundled templates (7.2 MB, dist ~17.8 MB); Consent on OC Pendiente, SOA on MC enviada and Sin cambios; MC gained client phone and email; six SignWell link slots in Ajustes. Writer's Risk: item 6 (browser fill and English SOA placement proven only by a headless harness) → independent verifier launched. Assess slice 465ae96..f4675e6 with --escalate-item 6: high, review due.
- T4 (21f7d04): Golden Rule values come from PDF form fields (pdfToText appends them); new supp_card type; payments read carrier and insured. Parent added Allstate (Integon, National Health Insurance Company) and GeoBlue (BCBS Global Solutions) aliases, RANK for supp_card, and OCR when a PDF has under 200 characters and is not recognized (the Allstate card has 49). Choices to confirm with the user: "AdvantageGuard Hospital" plan name, Golden Rule beneficiary as "Name (Relationship)", a Supp card dropped on another tab switches to Supp.
- The agency's Consent forms are still not detected as consent without the file name (pre-existing; T3).
- User approved creating 2 SignWell test templates (Consent QAgency Spanish, SOA Spanish); in progress in the user's Brave.

L14 (2026-11-15) T6 verification and SOA change.
- Verifier on f4675e6: S6 FAIL with one blocker, S7 and S8 PASS. B1: on the QAgency Spanish Consent, an accented value makes PDF.js set NeedAppearances. PDF.js writes the date only on the two "Fecha" widgets, not on their parent field, so Chrome draws both dates blank. Advisories: accented values rely on NeedAppearances (Chrome draws them correctly); SOA links have one slot per language, not per office; the invalid-link hint omits http://; edits in the section follow a language or office switch.
- User (verbatim): "only allow the client to sign in the SOAs, the agent will sign later, after we get it signed by the customer". The SignWell SOA test template keeps only the client's signature and the date (locked to the signing date); the agent fields placed earlier were removed. The SOA link now carries no parameters (SIGN_IDS.soa empty). The downloaded SOA PDF still fills the agent section (not a signature); to confirm with the user.
- Correction 31d2c3d: fillPdf appends an incremental update that writes /V on each parent field with kids (the Spanish Consents' "Fecha"); files it cannot read stay as PDF.js saved them (the English SOA keeps its fields in object streams and never sets NeedAppearances). RED: 3 failing, then GREEN 23/23; full suite 154/154. B1 recheck by the verifier: PASS.

L15 (2026-11-15) Review and SignWell templates.
- B1 recheck on 31d2c3d: PASS. Chrome (PDFium) shows "Fecha: 11/15/2026" on pages 1 and 2 of the QAgency and ATH Spanish Consents with "José Luis Pérez Núñez", also from the app's download. The parent field has /V in the latest revision, and the xref offsets and /Prev check out. All 6 templates fill and reopen with the same values as f4675e6. The verifier's scratch was removed.
- Native review of 465ae96..31d2c3d: high (item 6 escalated; tools/build.js process boundary). The user granted consent; START then stopped with lens_context_budget_exceeded, because the T6 commit carries 7.2 MB of bundled templates. No authority was created. The T6 proof is the independent verifier (S6, S7, S8 PASS after B1). 31d2c3d alone assesses medium, under_budget.
- SignWell test templates (user's account, fake data only), both in Spanish with email verification off: Consent QAgency Español https://www.signwell.com/new_doc/f16BDePQOsHiTJLy/ and SOA Español https://www.signwell.com/new_doc/YPUegKWPzhwjWRyI/. The SOA has only the client's signature and the date locked to the signing date. Email subject "Por favor firme su formulario de Alcance de la Cita (SOA)"; recipient language Español.
- Next: T3, then T5. To confirm with the user: whether the downloaded SOA PDF should leave the agent section blank too.

L16 (2026-11-15, user, verbatim): "Leave it blank" (asked whether the downloaded SOA PDF should also leave the agent section blank). Then, after hearing that every filled SOA field sits in the agent section: "well, date could be set automatically the same dateof signature". Asked "Blank the agent section and stamp the appointment date with the signing date?": "Yes, both".
- SignWell SOA Español: a second date field on "Fecha en que se realizará la cita", locked to the signing date. Saved, and checked after a reload: 1 signature and 2 date fields, both locked; no text fields. The Template Link is unchanged.
- Toolbox: the SOA templates map no fields, so the download is the agency's SOA as it is (5 boxes checked); fillPdf returns the template bytes unchanged. FIELDS.soa keeps only the beneficiary name and phone, which feed the Cliq line and the SMS button; soaValues returns only those. Removed the contact-method, plans and phone-split code. RED 4 failing → GREEN forms 23/23, full suite 154/154. Uncommitted until T3 returns: the README (SOA paragraph) and the "Descargar PDF lleno" label for the SOA are in T3's edit surface.

L17 (2026-11-15) T3 and the unfilled SOA committed.
- T3 (5c56679), by the writer:
  - New oc_docs type: one Network row per sent document, "OC_Docs Submitted_<category>" or "OC_Docs Submitted_<FIRST>_<category>".
  - My Plans reads "Clarity Silver", not "Communication". The Eligibility Notice is detected blind and stops at the Eligibility Guide.
  - App Summary OCR reads the name, year and yearly income; a 2-digit birth year is never in the future.
  - Consent forms are detected blind (the lost "ti" ligature).
  - Parent checks: the diff stays inside the surfaces; full suite 170/170; leak check clean (only fictitious IDs; "Cape Coral" is a city in older fixtures, with fictitious streets); mergeDocs has a single caller.
  - Unrequested changes accepted as defect fixes, to confirm with the user: a document read before the client's name counts as the principal's (it no longer stores the "Sin nombre" placeholder, shown as "(Sin)" in the note); a dropped duplicate letter is no longer added twice; the docs list shows a non-household person.
  - Writer's choices to confirm: dependent first name in capitals (`_YANET_`); Docs Submitted month = note month; category file labels (Income, Citizenship, SSN, Job-based coverage, Medicaid CHIP, Medicare, American Indian status, TRICARE, VA coverage, Peace Corps).
- Unfilled SOA (0a9ddf0): the SOA maps no fields; the button reads "Descargar PDF"; the README is updated (SOA paragraph and SignWell row with the two signing dates); full suite 170/170.
- Assess 21f7d04..0a9ddf0 (item 3 escalated): high, review due. The independent verifier runs first; native review consent follows.

L18 (2026-11-15, user, verbatim): "1. only the first letter, 2. fine, 3. fine". These answer: (1) the dependent's first name in Docs Submitted files is written "Yanet", not "YANET"; (2) the category file labels T3 chose are accepted; (3) the two unrequested fixes are accepted (no "(Sin)" in the note; no duplicate request when a letter is dropped twice).
- The fix is in its own commit: networkOf no longer upper-cases the first name. RED 2 failing → GREEN notes 59/59, full suite 170/170. The README example now reads `OC_Docs Submitted_Juan_Immigration status 2026 NOV`.

L19 (2026-11-15) Verifier on T3 and the unfilled SOA (candidate 0a9ddf0, baseline 31d2c3d).
- Verdicts: S1 FAIL, S5 PASS, S6 PASS, S7 PASS, S8 PASS.
- Differentials: 4625 note/forms cases and 234 extract runs. MC, Supp and payment samples are identical to the baseline. Existing Network rows keep their order and names.
- B1: on a fresh form, mergeDocs' name check read "undefinedundefined", so a principal's doc stored the "Sin nombre" placeholder and its file got "_SIN_".
- B2: editing the client's name after the drop (an accent, a middle name) turned the principal's doc into a dependent's.
- Advisories, all pre-existing or minor:
  - A1: the same check on lines 668, 814 and 660 predates T3.
  - A2: the Eligibility reader takes a row label as the person ("Proof").
  - A3: a hand-added "—" request no longer matches a letter's no-person request.
  - A4: a Docs Submitted page with no open item sets a docsub flag with no row.
  - A5: unticking Enviado leaves the flag set.
  - A6: the scan address keeps a trailing "-".
- Correction dae41ab:
  - mergeDocs guards the name check.
  - Docs read as the principal's (or with no person, or matching the principal) carry `titular`.
  - Choosing a Persona by hand sets or clears it.
  - docTitular honours the flag and compares names without accents.
  - RED 1 failing → GREEN notes 60/60, full suite 171/171.
- Recheck of B1 and B2 at dae41ab: PASS (real app over CDP: fresh form, accent edit, middle name, dependent, reassign by hand).

L20 (2026-11-15) Recheck, then native review.
- B1 and B2: PASS at dae41ab; full suite 171/171.
- New advisory from the recheck (no correction loop): changing a Docs Submitted doc's Persona by hand moves its row to a new key, so the tick, "Guardar" and the note line drop until the Persona is set back.
- Scratch with real data removed: the verifiers' tmp.* folders and scratchpad t3, t4, t6 and t6b. The scratchpad samples stay for T5's browser check.
- Native review of 21f7d04..dae41ab: 18 files, 1,222 lines; lenses risk and reliability. Consent granted by the user (the second time this session). Lineage review-7f239d6bbe732d0c; reviewer captures running.

L21 (2026-11-15) Review outcome and T5.
- Native review of 21f7d04..dae41ab: approved and acknowledged; authority burned for lineage review-7f239d6bbe732d0c. Advisories, not fixed:
  - R3-001 (a crash in networkOf) is a false positive: docsOf filters unknown categories.
  - R3-002: same as the recheck advisory in L20 (a hand Persona change drops the tick and "Guardar").
  - R3-003: updateFileNames compares DOM text to decide a re-render.
  - R3-004: same as A4.
  - R3-005: mergeDocs has no app.js tests.
  - R3-006: vBirth depends on the clock.
- T5:
  - Version 1.9.0 in package.json, js/config.js and sw.js (8db4325).
  - dist rebuilt: QAgency-Toolbox.html 17,802,491 bytes, QAgency-Toolbox-Windows.zip 12,076,778 (97961ae). README size line ("about 17 MB") still holds.
  - Full suite 171/171 after restoring CRLF in the bumped files.
  - Browser check of dist over a local http server, PASS:
    - Version 1.9.0 shows, and the 6 bundled templates load.
    - MC App enviada SMS in Spanish and English, with usted.
    - Supp App enviada SMS in Spanish and English, with usted.
    - The SOA section shows "Descargar PDF" and the 2 fields, with the template note.
    - The OC Pendiente Consent shows "Descargar PDF lleno", 10 fields, and the Cliq line "Enviar CONSENT a Aleida Ruiz pls @Support QAgency".
  - The console's 404s for sw.js and favicon.ico come from serving dist/ over http: dist ships no sw.js, registration runs only on http(s) and has a catch (js/app.js), so the file:// distribution is unaffected.
- Assess of dae41ab to the release and this doc (6 paths, 2,109 lines, mostly the rebuilt dist): medium, under_budget; no review due.
- Scratch with real data removed after the browser check: the scratchpad samples, samples-dental, samples-dental2, samples-pay, samples-supp, w4, harness and b1.
- Next: push and PR are the user's decision.
