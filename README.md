# Q Agency Toolbox

One app that turns a client contact into everything the team has to write afterwards:

- the **Zoho CRM note**, in the shape of the agency's PROCESS TEMPLATES
- the **task name**, in the TASK Q AGENCY format
- the **Cliq report line**, in the STANDARD FORMs - REPORT format
- the **SMS for the client**, signed with the office (QAgency or ATH Insurance)
- the **file names** for saving each document to the Network, per NOMBRE DE ARCHIVOS
- the **Consent** (Obamacare) and the **SOA** (Medicare) PDFs filled in with the client's data, with the Cliq line that asks Support to send them

Pick the line of business and how the contact ended, drop the PDFs or screenshots saved for the case, check the fields, copy.

![The note screen with three Marketplace documents loaded](docs/screenshot.png)

A second tab, **Tasks**, is the web version of the TASK Q AGENCY document: every task name, with your initials, the date after VER NOTA and the closing tags filled in, one click to copy.

![The Tasks tab](docs/tasks.png)

## Installing it

There are three ways to run it. All of them are the same app.

| | How | Good for |
| --- | --- | --- |
| **Windows package** | Unzip `dist/QAgency-Toolbox-Windows.zip`, double-click `Instalar.bat` | A real desktop app: Start menu and Desktop shortcut with the agency icon, its own window, pin to the taskbar. No admin rights, no internet. |
| **Single file** | Open `dist/QAgency-Toolbox.html` in Chrome or Edge (Brave works, but cannot save to the Network) | Trying it, or a computer where nothing can be installed. |
| **Hosted** | Put the repository root on any static web host (no build step needed) | One address for everyone, an **Instalar** button in the browser, works offline after the first visit, and updates reach the whole team on their own. |

The OCR engine with its Spanish and English models and the six Consent and SOA templates are bundled, so the single file is about 17 MB.

The Windows installer copies the app to `%LOCALAPPDATA%\QAgencyToolbox` and creates shortcuts that open it in app mode with Chrome or Edge, whichever it finds first. Brave is used only when neither is installed, because Brave blocks choosing a folder, so it cannot save to the Network. To update, run `Instalar.bat` from the new package; settings are kept as long as the same browser opens it. Each browser keeps its own settings, so after an update that moves the app from Brave to Chrome or Edge, fill in Ajustes once more. `Desinstalar.bat` removes it. The installer has not been run on a real Windows machine yet, so try it on one computer before sending it to the team.

If you host it, keep the host private or clear the roster first: `js/config.js` contains the team's names and NPNs.

## Using it

1. Choose who you are at the top right (once; the browser remembers it).
2. **Nota** tab: choose Obamacare / Medicare / Suplementario and the situation.
3. Drop the PDFs or images anywhere on the window, or paste a screenshot with Ctrl + V. Fields filled from a document get a gold edge, and the list on the left shows how many are waiting to be reviewed in each section.
4. Complete what the documents don't carry.
5. **Copiar nota** (or Ctrl + Enter), then copy the task and the report line.

The note, task and report can be edited by hand before copying. If you edit the note and then change a field, the note is left alone until you press **Regenerar**.

**Hora de revisión del task** is the time the task should be looked at again. Type it (`2`, `230`, `2:30pm`, `14:30`; from 1 to 6 without AM/PM means the afternoon) or pick it from the grid; it always lands on :00 or :30, and the arrow keys move it half an hour. It goes in parentheses in the note (`Se conversa con la cliente (02:30)`) and in the task after VER NOTA.

The task dropdown only lists the tasks of the line you are in (Marketplace for Obamacare, Medicare for Medicare, Supp for Suplementario); every other task is in the **Tasks** tab. **Etiquetas al final** has *CRONIC* and *URGENT*: tick one or both and they go at the end of the task in that order (`… VER NOTA 11/15/2026 (09:00) CRONIC URGENT`).

### Obamacare

There are three situations:

- **App enviada.** *Hogar* has the titular's address, phone and email, and lists the people in the application: the titular (named as in Zoho) and everyone else, each with *Taxes* and *Cobertura* toggles and, when opened, their relationship, US status (citizen, resident, work permit or something else, typed), DOB and yearly income. The note counts taxes and coverage and names them: `Sus ingresos anuales son $32,000 (Beatriz $25,000, Juan $7,000). Son 3 en los taxes (Beatriz, Juan, Ana) y 2 pidiendo cobertura (Beatriz, Juan).` *Plan* keeps company, plan name, status, coverage start and the monthly premium the client pays. *Documentos que pide el Mercado* is a checklist: what the Marketplace asked for (the 11 data matching issues from healthcare.gov), for whom, the due date, and once **Enviado** is ticked, which document was sent. While the Marketplace is asking for any document, sent or not, the automatic task is `FOLLOW UP DOCS BY` the earliest due date of all of them; otherwise `FOLLOW UP CUSTOMER SERVICE` with the payment tag. The note always goes in the principal's profile, so there is no dependent option (`FOLLOW UP CUSTOMER SERVICE DEP` can still be picked by hand).
- **Pendiente** covers quotes, consents waiting for signature and apps ready to process. *Planes cotizados* takes as many plans as were discussed, one line each in the note, with **Seleccionar** for the one the client chose and **Revisará los planes** when the quote is sent or handed over for review. Network only has the consent: the note ends with `Carta de consentimiento enviada.` or, once received, `Se firmó la carta de consentimiento en línea` (call) or `en la oficina` (in person). The task is `FOLLOW UP CONSENT`, `MKPL APP PENDING` once the consent is in, or `FOLLOW UP OPEN ENROLLMENT OC` if the client will review the plans. No SMS. Below the form, **Consent para firmar** fills in the consent letter (see *Consent and SOA*).
- **Cancelación** asks for the reason (too expensive, coverage through work, immigration status or other), what is being cancelled, the company and the agent, and whether it is **Cancelada** (the coverage never started: a renewal for next year, or an application cancelled before the effective date, or after it without payment) or **Terminada** (the coverage ends in a given month, for example when moving to Medicare or to job-based insurance). Cancelada asks for the coverage start and ticks *My Plans & Programs (CANCELLED)*, whose file name takes that month and ends in `CANCELLED`; Terminada asks for the termination date and ticks *My Plans & Programs (TERMINATED)*, whose file name takes the month the coverage ends and ends in `TERMINATED`. The task is `FOLLOW UP LEAD_INACTIVE CLIENT OC`.

**Cambios.** In *App enviada* and *Pendiente*, whatever ends up different from what the documents filled in goes in the note under `Cambios:`, one line per change, right after the household line:

```
Cambios:
- Beatriz: ingreso anual $25,000 (antes $32,000), estatus Residente
- Juan: no pide cobertura
- Se agrega a ANA DIAZ (Hijo/a), DOB 05/02/2020, estatus Ciudadano
- Se quita a PEDRO DIAZ
- Dirección: 456 Oak Ave, Miami, FL 33125 (antes 123 Main St, Miami, FL 33101)
- Teléfono: (305) 555-0199
```

A change is a value edited, cleared or toggled after a document filled it (shown with `antes`), a person added by hand to a household that came from a document, or a person from a document removed. Address, phone, email, US status and DOB also count when they are typed where no document had them. With no documents loaded there is nothing to compare against, so only those last five can appear.

### Medicare Advantage

There are two situations:

- **App enviada.** Whoever writes the note talked to the client and processed the app, so there is no collaborator. *Fecha del SOA* is the date of the note unless it is changed, and the SOA is ticked in Network like any other document. The contract (H-PBP) is part of the plan name; when the application shows it apart, the reader appends it. **Tiene prima mensual** shows the premium; off, the note says `Premium: $0.00`. The note says `App ID: …` and `Medicaid ID: 12345678`, and Network has the SOA and the App. The SMS is the agency's official Medicare SMS (see *SMS, email and file names*), and there is no email.
- **Sin cambios.** The client reviews their plan and keeps it, so it only asks for the client, the plan name and the SOA: `ER_11/14/2026: Se atiende al cliente en cita telefónica (09:00), se revisan los beneficios de su plan para 2027 y decide mantenerse en su plan actual - Humana Gold Plus H1036-077 (HMO)`. The report line is for the NO CHANGE channel in Cliq: `Diaz, Beatriz se quedara en su mismo plan Humana Gold Plus H1036-077 (HMO)`. The task is `MC MANTENIMIENTO`, or `FOLLOW UP LEAD_INACTIVE CLIENT MC` when **Es cliente** is off. No SMS.

In both, *Cliente* also has the client's phone and email, which only feed the SOA's Cliq line and signing link, and below the form **SOA para firmar** downloads the Scope of Appointment (see *Consent and SOA*).

### Consent and SOA

**Consent para firmar** (Obamacare *Pendiente*) and **SOA para firmar** (Medicare, both situations) work with the agency's PDF forms, which are bundled with the app. The consent template follows the office in **Ajustes** (QAgency or ATH Insurance); both follow the language switch in the section (Español / English), which is the same client language the SMS uses.

- **Consent:** client name, consent date (the note date, also on page 2), agent and NPN (from *Agente (NPN)*), marital status (*Casado/a* or *Married* when the household has a *Cónyuge*, otherwise typed), yearly household income, people in the taxes, people asking for coverage, and the selected quoted plan with its premium (the only quoted plan when none is selected).
- **SOA:** nothing is filled in. Every field on the SOA is in the agent's section, which the agent completes and signs after the client signs, so **Descargar PDF** downloads the form as it is, with the five product boxes checked as they are on both SOAs. The section only shows the beneficiary's name and phone, for the Cliq line and the SMS.

Every value can be changed in the section; changed values stay until **Volver a los datos de la nota**. **Descargar PDF lleno** fills the consent in the browser and downloads it with the Network file name (`Diaz, Beatriz - OC_Consent Ambetter 2026 NOV.pdf`); the SOA downloads the same way (`Diaz, Beatriz - Medicare_Humana_SOA 2026 NOV.pdf`). Signature fields are left empty. **Para pedirlo en Cliq** has the line to copy: `Enviar CONSENT a Beatriz Diaz al bea@example.com y al (305) 555-0100 pls @Support QAgency` (or `Enviar SOA a …`), without the email or the phone when it is missing.

**Signing link (SignWell test).** In **Ajustes → Enlaces de firma (SignWell)**, paste the Template Link of each SignWell template: Consent QAgency Español, Consent QAgency English, Consent ATH Español, Consent ATH English, SOA Español and SOA English. When the link for the current form, office and language is set, the section shows **Enviar enlace de firma**: the link with the values added as query parameters (empty ones are skipped), plus a short SMS and an email in the client's language, signed with the office name, each with **Copiar** and with **Abrir en el teléfono** / **Abrir en el correo** when the client's phone or email is valid. Without a link, the section says which one to add. The app only builds the link; it never contacts SignWell. The parameters use these field API IDs, which must match the SignWell templates:

| Form | Field API IDs |
| --- | --- |
| Consent | `client_name`, `client_name_sign`, `consent_date`, `agent_name`, `agent_npn`, `plan`, `premium`, `marital_status`, `income`, `tax_people`, `covered_people` |
| SOA | none: the SignWell SOA only has the client's signature and two dates set to the signing date (today's date and the appointment date), because the agent completes and signs their section after the client signs, so the SOA link is sent as it is |

The English SOA came without form fields, so `tools/make-fillable-soa.js` added them once, in the same places as the Spanish one (the phone goes in its digit boxes). To change a template, put the six PDFs in a folder and run `node tools/vendor-forms.js <folder>`.

### Suplementario

There are two situations, and *Tipo de gestión* is a new application or a renewal:

- **App enviada.** *Members* works like the Obamacare household: the titular's address, phone and email, and each person with a **Cobertura** toggle and their DOB. The note names whoever has coverage by first name: `Se procesa app de Hospital de GR para el cliente, Maria y Luis.` The plan keeps the product, company, plan name, premium, effective date and Policy # (no App ID or plan type). *Pago* is **Pago confirmado** or **Pendiente de pago**. Whoever writes the note processed the app, so there is no collaborator. **Email para el cliente** has one part with its own **Copiar**, in Español or English: the company, `ID #` (the Policy #), the coverage start and the monthly premium, signed by whoever talked to the client. The SMS is the agency's official Supplemental SMS (see *SMS, email and file names*); the note keeps its current text until the agency's standard format is ready.
- **Cotización.** Same *Members* and *Gestión*; the plan has no App ID or Policy #, and the date is **Fecha efectiva estimada**, which goes in the note after the quoted plan. Covered people besides the titular are named: `desea cotizar seguro dental para el cliente y Maria.` The SMS keeps its current text, and the quote email is not in the app yet.

### Companies

Obamacare and Medicare pick the company from the agency's official list, in this order, or **Otra**, which asks for the name:

- Obamacare: Florida Blue, Ambetter, Wellpoint, UHC, Oscar, Cigna.
- Medicare: Humana, UHC, Aetna, Florida Blue, BCBS of (with the state in two letters), Healthspring, Devoted, Freedom, Simply.

The note, the report and the file names use the short form: `FB` for Florida Blue, `BCBS of GA`, `Healthspring`. A company read from a document is matched to its option; one outside the list (Molina, AvMed, Wellcare…) comes in as **Otra** with its name. Suplementario keeps a free company field with suggestions. The list lives in `js/config.js`: the carriers with `option` are the official ones.

### People

Each person in **Ajustes → Equipo** has the initials they sign notes and tasks with, and, if different, the initials they appear with as agent in the Cliq report (Liseth signs notes as DI and is agent LI), plus an optional direct phone that goes under their signature in the SMS of a sent app. Phones are typed in Ajustes and stay in that browser; they are not in the code.

*Agente y colaborador* has three roles: **Habló con el cliente**, **Agente (NPN)** (a list of the agents with their NPN) and **Colaborador** (who processed the application). They default to whoever writes the note. Medicare and Suplementario have no **Colaborador**: whoever writes the note processed the app. The note says `NPN: LI` (the NPN is enough, so there is no Writing ID), and names who talked to the client and who processed the app only when it was someone else. When the person who talked to the client is not the one who processed the app, the report line starts with their initials (`FV: Q1234 - … (LI)`); a checkbox under the report switches that on or off.

### The note

Each situation writes the note the way PROCESS TEMPLATES does: `ER_11/09/2026:` and one sentence, then the case data in the agency's own labels (`ID#`, `Status`, `Inicia cobertura`, `Premium`, `Enrollment Period`, `MC #`, `PART A`, `Conf/App #`, `Effective Date`, `Monthly Premium`, `AutoPay`…), the agent as `NPN: LI`, and `Docs en mi folder del NETW: …`. **En la nota** switches between *el cliente* and *la cliente*.

A submitted application ends with «Se reporta en el botón rojo» (it can be switched off in Ajustes). The task never goes in the note; it is only in the Task box.

The note never asks for or includes Marketplace usernames, passwords or security questions.

### SMS, email and file names

The SMS card writes a short message for the client: what was done and what they need to do next, greeting them by first name and signed by the office chosen in Ajustes, with that office's phone number if one is set. The counter shows how many text messages it takes; accents or emoji make each one hold 70 characters instead of 160.

For an Obamacare **App enviada**, the SMS follows the agency's format, in **Español** or **English** (the switch on the SMS and email cards):

```
Estimado Miguel: Somos QAgency Insurance. Hemos renovado su seguro de salud 2027 con Florida Blue.
Plan: myBlue Essentials Silver 27M07-01C
Inicio: 01/01/2027
Premium: $85.40/mes
Revise su email y para cualquier duda, comuníquese de inmediato con nosotros. Saludos Eduardo Chinea
Directo: (239) 555-0101
Oficina: (239) 555-0102
🎁 ¡Por cada 4 personas que nos refiera, gana una GIFT CARD!
```

It is signed by whoever talked to the client, with their direct phone from Ajustes and the office phone. The first sentence follows *Tipo de gestión*: renewed, enrolled (new application) or updated (life change). *Estimado* becomes *Estimada* with *la cliente*.

Medicare and Supplemental **App enviada** use the agency's official SMS, with the same switch, signature and office name:

```
Estimado Miguel:
Somos ATH Insurance. Le confirmamos que su inscripción en Medicare para el 2027 se ha completado con éxito.
Compañía: Humana
Plan: Gold Plus - Diabetes and Heart (HMO C-SNP) H1036-311-000
Fecha de efectividad: 01/01/2027
Para cualquier duda, comuníquese de inmediato con nosotros. Saludos
Ana Ruiz
Directo: (305) 555-0101
Oficina: (305) 555-0100
```

```
Estimada Aleida:
Somos ATH Insurance. Hemos completado la solicitud de su seguro de hospital con Golden Rule
Plan: AdvantageGuard Hospital
Inicio: 01/01/2027
Premium: $78.03/mes
Policy #: 900000123
Detalles en su email. Si tiene dudas, llámeme de inmediato. Saludos
Ana Ruiz
Directo: (305) 555-0101
Oficina: (305) 555-0100
```

The Medicare year is the plan year, or the effective date's year when it is empty. A line whose value is empty is left out.

Below it, **Email para el cliente** has two parts, each with its own **Copiar**: part 1 with the policy (company, coverage start, plan and monthly premium) and part 2 with what the Marketplace is requesting (every requested document with its due date, left out when nothing is requested) and the closing signed by whoever talked to the client. Both follow the same Español / English switch.

The Network section lists the documents for the line of business, each with its file name ready to copy. Copying a name also ticks the document, so it is listed in the note. Names follow the agency's official formats, `Lastname, Firstname MiddleName - …`:

| Document | File name | Date |
|---|---|---|
| App Summary (OC) | `Diaz, Beatriz - OC_App Summary 2027` | plan year |
| Consent (OC) | `Diaz, Beatriz - OC_Consent Ambetter 2026 NOV` | note |
| Eligibility letter (OC) | `Diaz, Beatriz - OC_EligibilityNotice 2027` | plan year |
| My Plans & Programs (OC) | `Diaz, Beatriz - OC_My Plans & Programs Ambetter 2027 JAN` | coverage start |
| Cancelled (OC) | `Diaz, Beatriz - OC_My Plans & Programs Ambetter 2027 JAN CANCELLED` | coverage start |
| Terminated (OC) | `Diaz, Beatriz - OC_My Plans & Programs Ambetter 2027 JAN TERMINATED` | termination date |
| Docs submitted (OC) | `Diaz, Beatriz - OC_Docs Submitted_Immigration status 2026 NOV` | note |
| Docs submitted (OC, dependent or spouse) | `Diaz, Beatriz - OC_Docs Submitted_Juan_Immigration status 2026 NOV` | note |
| App (MC) | `Diaz, Beatriz - Medicare_Humana_App 2027 JAN` | coverage start |
| SOA (MC, app or change) | `Diaz, Beatriz - Medicare_Humana_SOA 2026 NOV` | SOA signature |
| SOA (MC, no change) | `Diaz, Beatriz - Medicare_SOA 2026 NOV` | SOA signature |
| App (Supp) | `Diaz, Beatriz - Accident_Allstate 2027 JAN` | coverage start |
| Payment confirmation (OC, Supp) | `Diaz, Beatriz - Payment Confirmation - OC_FB 2026 JUL`, `… - Payment Confirmation - Dental_FB 2026 JUL` | payment |
| ID card (Supp) | `Diaz, Beatriz - Dental_FB - CARD 2026 JUL` | coverage start |

The plan year is *Año del plan*, or the year of the coverage start when it is empty, or the year of the note.

Docs submitted has one row per requested document ticked **Enviado** (*Docs Submitted: Estatus migratorio*, *Docs Submitted: Estatus migratorio (Juan)*). The titular's document has no name in the middle; another person's has their first name. The middle part is the kind of document: `Immigration status`, `Income`, `Citizenship`, `SSN` and so on (the `file` of each entry in `MKPL_DOCS`, `js/config.js`).

### Saving to the Network

In **Ajustes → Carpetas del Network**, choose your folder in the NETW once under **General**. When a line of business keeps its documents somewhere else (for example one folder for OC and another for MA), choose that folder in its own row; a line without a folder of its own uses the general one. Saving uses the folder of the line you are working in, and the Network section shows which one. The browser remembers the folders, and may ask for permission again after it restarts. Each document you dropped gets **Guardar** in the Network section, and **Guardar todo en el Network** saves them all, with the generated file name and the original extension. Saving ticks the document for the note. If a file with that name already exists, it asks before replacing it. Only Chrome and Edge can write to a folder.

### Copying faster

- **Copiar siguiente** (at the top of the right column, or Ctrl + Shift + Enter) copies the note, then the task, the report, the SMS and the email, skipping what the situation does not show. It starts over with the note when a field changes.
- **Ventana flotante** opens a small window that stays on top of Zoho, with the client's name and the same copy buttons (Chrome and Edge).
- **Abrir en el teléfono** and **Abrir en el correo** open the SMS or the email with the text ready, when the titular's phone or email is filled in.

## What it reads

| Document | Fills |
| --- | --- |
| My Plans & Programs (HealthCare.gov) | plan, monthly premium, status, people covered, coverage start |
| Eligibility Letter | application ID, plan year, primary contact, income, household size, documents requested with the person and due date (not from the Eligibility Guide that follows the notice) |
| App Summary (HealthCare.gov, also the printed copy, scanned) | application ID, plan year, applicant, DOB, home address, yearly income, household size |
| Docs submitted (HealthCare.gov *Upload documents*, with the open item) | application ID, plan year, the document sent and for whom: it marks the requested document as **Enviado**, or adds it. The account holder's own document also fills the titular's full name from the uploaded file (`Diaz, Beatriz - …`) |
| Consent (the agency's QAgency and ATH forms, Spanish or English) | ticks the Consent for the note |
| Medicare application summary (carrier portal, Spanish or English) | MBI, Part A/B, plan (with its contract), election period, PCP, App ID, agent |
| Scope of Appointment | beneficiary, signature date |
| Payment receipt | amount, date, confirmation, last 4 digits, autopay |
| Supplemental application (dental, vision, hospital, accident, cancer, short term, life, international, discount) | product, carrier, plan, premium, effective date, policy number, beneficiary |

### Scans and screenshots

Scanned PDFs (the first 6 pages), images (PNG, JPG, WebP, BMP, GIF) and screenshots pasted with Ctrl + V on the **Nota** tab are read with OCR, in Spanish and English, inside the browser and without internet. The text goes through the same reader as a PDF with text, so the same fields are filled. Each one takes a few seconds (the first one of the session a little longer), and the file shows *leído con OCR, revísalo*: OCR can misread a letter or a digit, so check those fields with care.

OCR needs Chrome or Edge up to date. In a browser that cannot run it, scans and images are listed without data and the fields are typed by hand. **Pegar texto** is the fallback when a PDF will not open.

The reader was built against the sample documents in `samples/` (all data fictitious). Real documents vary by carrier and portal, so expect to tune it: the **Ver texto** link next to each file shows exactly what was read, which is what is needed to adjust a rule in `js/extract.js`.

## Privacy

- Documents are read inside the browser. The page makes no network requests with client data, and its Content-Security-Policy blocks them (`connect-src 'none'`). Fonts, the PDF reader and the OCR engine with its language models are bundled, so nothing loads from a CDN. The policy allows WebAssembly (`'wasm-unsafe-eval'`) only so the bundled OCR engine can run; it still cannot connect anywhere.
- Client data lives only in memory and is gone when the window closes. Only settings are stored in the browser: the team list, your name, the office and its phone, the SignWell template links, the theme, and the permission for the Network folders (not their files). Saving to the Network writes only to the folders you chose.
- The Consent and SOA PDFs are filled inside the browser and downloaded; nothing is uploaded. A signing link carries the client's values in its address, so it is only built, never opened by the app, and it is meant for SignWell test data until there is a BAA.
- Social Security numbers are never extracted, and a warning appears if the note contains something shaped like one.
- When hosted, a service worker keeps a copy of the app's own files so it opens offline. It never handles documents or client data.

## Project layout

```
index.html              the page (works opened from disk or served)
css/app.css             styles, light and dark
js/config.js            catalogs: team, offices, carriers, tasks, situations and their wording
js/notes.js             builds the note, task and report (pure functions)
js/forms.js             Consent and SOA: template choice, PDF field values, Cliq line, signing link
js/extract.js           recognises documents and pulls the fields out
js/ocr.js               reads scans and screenshots offline (OCR in a worker)
js/app.js               the screen: note form, Tasks tab, settings, install
js/util.js              dates, money, names
sw.js                   offline copy when hosted
manifest.webmanifest    install metadata when hosted
vendor/pdfjs/           PDF.js 3.11.174 (Apache-2.0)
vendor/tesseract/       tesseract.js-core 7.0.0 and the spa/eng models (Apache-2.0)
vendor/fonts/           Inter and JetBrains Mono (OFL-1.1)
vendor/forms/           the agency's Consent and SOA templates, as scripts
samples/                fictitious PDFs for demos and testing
tests/                  unit tests (node --test)
tools/build.js          makes dist/QAgency-Toolbox.html and the Windows zip
tools/windows/          installer scripts that go into the zip
tools/make-samples.js   regenerates samples/ (needs Playwright)
tools/vendor-ocr.js     regenerates vendor/tesseract/ from npm packages
tools/vendor-forms.js   regenerates vendor/forms/ from the six template PDFs
tools/make-fillable-soa.js  adds the form fields to the English SOA (one time; pdf-lib from a scratch folder)
```

Most day-to-day changes are edits to `js/config.js`: adding a carrier, a task type, a situation, or changing the suggested wording.

```bash
npm test
```

```bash
npm run build
```

Run the build after any change so the files in `dist/` match the source. For a release, change the version in `js/config.js`, `sw.js` and `package.json` together; a test fails if they differ.
