# Q Agency Toolbox

One app that turns a client contact into everything the team has to write afterwards:

- the **Zoho CRM note**, in the shape of the agency's PROCESS TEMPLATES
- the **task name**, in the TASK Q AGENCY format
- the **Cliq report line**, in the STANDARD FORMs - REPORT format
- the **SMS for the client**, signed with the office (QAgency or ATH Insurance)
- the **file names** for saving each document to the Network, per NOMBRE DE ARCHIVOS

Pick the line of business and how the contact ended, drop the PDFs saved for the case, check the fields, copy.

![The note screen with three Marketplace documents loaded](docs/screenshot.png)

A second tab, **Tasks**, is the web version of the TASK Q AGENCY document: every task name, with your initials, the date after VER NOTA and the closing tags filled in, one click to copy.

![The Tasks tab](docs/tasks.png)

## Installing it

There are three ways to run it. All of them are the same app.

| | How | Good for |
| --- | --- | --- |
| **Windows package** | Unzip `dist/QAgency-Toolbox-Windows.zip`, double-click `Instalar.bat` | A real desktop app: Start menu and Desktop shortcut with the agency icon, its own window, pin to the taskbar. No admin rights, no internet. |
| **Single file** | Open `dist/QAgency-Toolbox.html` in Brave, Chrome or Edge | Trying it, or a computer where nothing can be installed. |
| **Hosted** | Put the repository root on any static web host (no build step needed) | One address for everyone, an **Instalar** button in the browser, works offline after the first visit, and updates reach the whole team on their own. |

The Windows installer copies the app to `%LOCALAPPDATA%\QAgencyToolbox` and creates shortcuts that open it with Brave, Chrome or Edge (whichever it finds first) in app mode. To update, run `Instalar.bat` from the new package; settings are kept. `Desinstalar.bat` removes it. The installer has not been run on a real Windows machine yet, so try it on one computer before sending it to the team.

If you host it, keep the host private or clear the roster first: `js/config.js` contains the team's names and NPNs.

## Using it

1. Choose who you are at the top right (once; the browser remembers it).
2. **Nota** tab: choose Obamacare / Medicare / Suplementario and the situation (App enviada, Esperando consent, Cotización, SOA pendiente, Sin contacto…).
3. Drop the PDFs anywhere on the window. Fields filled from a document get a gold edge, and the list on the left shows how many are waiting to be reviewed in each section.
4. Complete what the documents don't carry: payment status, what is pending, the follow-up date.
5. **Copiar nota** (or Ctrl + Enter), then copy the task and the report line.

The note, task and report can be edited by hand before copying. If you edit the note and then change a field, the note is left alone until you press **Regenerar**.

### People

Each person in **Ajustes → Equipo** has the initials they sign notes and tasks with, and, if different, the initials they appear with as agent in the Cliq report (Ana signs notes as DI and is agent LI).

In the *Agente y colaborador* section of a note, **Agente escritor** is the agent whose NPN was used and **Colaborador** is who actually processed the application. When they are different people the note names the collaborator and the report line starts with their initials (`MA: Q1234 - … (LI)`); a checkbox under the report switches that prefix on or off.

### The note

Each situation writes the note the way PROCESS TEMPLATES does: `ER_11/09/2026:` and one sentence, then the case data in the agency's own labels (`ID#`, `Status`, `Inicia cobertura`, `Premium`, `Enrollment Period`, `MC #`, `PART A`, `Conf/App #`, `Effective Date`, `Monthly Premium`, `AutoPay`…), the agent as `NPN: LI`, and `Docs en mi folder del NETW: …`. Conversations start with the call time in 12-hour format, `Se conversa con la cliente (02:44)`, and **En la nota** switches between *el cliente* and *la cliente*.

When the situation is a submitted application, the note ends with «Se reporta en el botón rojo» and the task line. Other situations end without them. Both can be switched off in Ajustes.

The note never asks for or includes Marketplace usernames, passwords or security questions.

### SMS and file names

The SMS card writes a short message for the client in Spanish: what was done and what they need to do next, greeting them by first name and signed by the office chosen in Ajustes, with that office's phone number if one is set. The counter shows how many text messages it takes; accents make each one hold 70 characters instead of 160, and **Sin acentos** fixes that.

The Network section lists the documents for the line of business, each with its file name ready to copy, for example `Caso, Angel - Medicare_Humana 2026 OCT`. Copying a name also ticks the document, so it is listed in the note. Plan documents (My Plans & Programs, the Medicare application, supplemental applications and ID cards) take the year and month of the coverage start; the rest take the date of the note, the SOA signature or the payment.

## What it reads

| Document | Fills |
| --- | --- |
| My Plans & Programs (HealthCare.gov) | plan, plan ID, premiums, tax credit, members, coverage dates |
| Eligibility Letter | application ID, APTC, income, household size, required documents and deadline |
| App Summary (HealthCare.gov) | application ID, applicant, income, household size |
| Medicare application summary (carrier portal, Spanish or English) | MBI, Part A/B, plan, contract, election period, PCP, confirmation, agent |
| Scope of Appointment | beneficiary, signature date |
| Payment receipt | amount, date, confirmation, last 4 digits, autopay |
| Supplemental application (dental, vision, hospital, accident, cancer, short term, life, international, discount) | product, carrier, plan, premium, effective date, App ID, policy number, beneficiary |

Scanned PDFs and screenshots have no text to read; they are still ticked in the *Documentos en Network* list by file name, and the fields are typed by hand. **Pegar texto** is the fallback when a PDF will not open.

The reader was built against the sample documents in `samples/` (all data fictitious). Real documents vary by carrier and portal, so expect to tune it: the **Ver texto** link next to each file shows exactly what was read, which is what is needed to adjust a rule in `js/extract.js`.

## Privacy

- Documents are read inside the browser. The page makes no network requests with client data, and its Content-Security-Policy blocks them (`connect-src 'none'`). Fonts and the PDF reader are bundled, so nothing loads from a CDN.
- Client data lives only in memory and is gone when the window closes. Only settings are stored in the browser: the team list, your name, the office and its phone, the theme.
- Social Security numbers are never extracted, and a warning appears if the note contains something shaped like one.
- When hosted, a service worker keeps a copy of the app's own files so it opens offline. It never handles documents or client data.

## Project layout

```
index.html              the page (works opened from disk or served)
css/app.css             styles, light and dark
js/config.js            catalogs: team, offices, carriers, tasks, situations and their wording
js/notes.js             builds the note, task and report (pure functions)
js/extract.js           recognises documents and pulls the fields out
js/app.js               the screen: note form, Tasks tab, settings, install
js/util.js              dates, money, names
sw.js                   offline copy when hosted
manifest.webmanifest    install metadata when hosted
vendor/pdfjs/           PDF.js 3.11.174 (Apache-2.0)
vendor/fonts/           Inter and JetBrains Mono (OFL-1.1)
samples/                fictitious PDFs for demos and testing
tests/                  unit tests (node --test)
tools/build.js          makes dist/QAgency-Toolbox.html and the Windows zip
tools/windows/          installer scripts that go into the zip
tools/make-samples.js   regenerates samples/ (needs Playwright)
```

Most day-to-day changes are edits to `js/config.js`: adding a carrier, a task type, a situation, or changing the suggested wording.

```bash
npm test
```

```bash
npm run build
```

Run the build after any change so the files in `dist/` match the source. For a release, change the version in `js/config.js`, `sw.js` and `package.json` together; a test fails if they differ.
