# Q Agency Toolbox

One screen that turns a client contact into the three things the team has to write afterwards:

- the **Zoho CRM note**, always in the same structure
- the **task name**, in the TASK Q AGENCY format
- the **Cliq report line**, in the STANDARD FORMs - REPORT format

Pick the line of business and how the contact ended, drop the PDFs saved for the case, check the fields, copy.

![The toolbox with three Marketplace documents loaded](docs/screenshot.png)

## Using it

**Fastest way:** open `dist/QAgency-Toolbox.html` in Chrome or Edge. It is a single self-contained file; it can be copied to any computer and opened with a double click, with no internet.

1. Choose your name at the top right (once; the browser remembers it).
2. Choose **Obamacare / Medicare / Suplementario** and the situation (App enviada, Esperando consent, Cotización, SOA pendiente, Sin contacto…).
3. Drop the PDFs anywhere on the window. Fields filled from a document get a gold edge so you know to review them.
4. Complete what the documents don't carry (payment status, what is pending, follow-up date).
5. **Copiar nota** (or Ctrl + Enter), then copy the task and the report line.

The note, task and report can all be edited by hand before copying. If you edit the note and then change a field, the note is left alone until you press **Regenerar**.

### Pinning it to the taskbar

- **Edge:** open the file → `···` → Apps → *Install this site as an app* → tick *Pin to taskbar*.
- **Chrome:** open the file → `⋮` → Cast, save and share → *Install page as app* (or *Create shortcut* with *Open as window*), then right-click its taskbar icon → *Pin to taskbar*.
- If the browser does not offer install for a local file, create a Windows shortcut whose target is
  `"C:\Program Files\Google\Chrome\Application\chrome.exe" --app="file:///C:/QAgency/QAgency-Toolbox.html"`
  (adjust both paths) and pin that shortcut.

Hosting the repository root on any static host (it needs no build step) gives a normal web address with a proper Install button, and everyone gets updates automatically. Note that `js/config.js` contains the team roster, so keep the host private or clear the roster first.

## What it reads

| Document | Fills |
| --- | --- |
| My Plans & Programs (HealthCare.gov) | plan, plan ID, premiums, tax credit, members, coverage dates |
| Eligibility Letter | application ID, APTC, income, household size, required documents and deadline |
| App Summary (HealthCare.gov) | application ID, applicant, income, household size |
| Medicare application summary (carrier portal, Spanish or English) | MBI, Part A/B, plan, contract, election period, PCP, confirmation, agent |
| Scope of Appointment | beneficiary, signature date |
| Payment receipt | amount, date, confirmation, last 4 digits, autopay |
| Supplemental application | product, carrier, plan, premium, effective date |

Scanned PDFs and screenshots have no text to read; they are still ticked in the *Documentos en Network* list by file name, and the fields are typed by hand. **Pegar texto** is the fallback when a PDF will not open.

The reader was built against the sample documents in `samples/` (all data fictitious). Real documents vary by carrier and portal, so expect to tune it: the **Ver texto** link next to each file shows exactly what was read, which is what is needed to adjust a rule in `js/extract.js`.

## Privacy

- Documents are read inside the browser. The page makes no network requests at all, and its Content-Security-Policy blocks them (`connect-src 'none'`).
- Client data lives only in memory and is gone when the window closes. Only settings are stored in the browser: the team list, your name, the theme.
- Social Security numbers are never extracted, and a warning appears if the note contains something shaped like one.

## Project layout

```
index.html            the page (works opened from disk or served)
css/app.css           styles, light and dark
js/config.js          catalogs: team, carriers, tasks, situations and their wording
js/notes.js           builds the note, task and report (pure functions)
js/extract.js         recognises documents and pulls the fields out
js/app.js             the screen
js/util.js            dates, money, names
vendor/pdfjs/         PDF.js 3.11.174 (Apache-2.0), bundled so nothing loads from a CDN
samples/              fictitious PDFs for demos and testing
tests/                unit tests (node --test)
tools/build.js        makes dist/QAgency-Toolbox.html
tools/make-samples.js regenerates samples/ (needs Playwright)
```

Most day-to-day changes are edits to `js/config.js`: adding a carrier, a task type, a situation, or changing the suggested wording. The team list can also be edited by each person under **Ajustes**.

```bash
npm test
```

```bash
npm run build
```

Run the build after any change so `dist/QAgency-Toolbox.html` matches the source.
