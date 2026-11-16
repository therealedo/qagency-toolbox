# HealthSherpa quotes from screenshots

Objective: read the plan name, carrier and monthly premium of every plan on a HealthSherpa screenshot into Planes cotizados.
Branch: feat/healthsherpa-quotes (stacked on fix/document-merge). Delivery: ask-on-risk. Runner: `node --test tests/*.test.js`.

## Specs

- S1 — "since we use healthserpa to quote, make it be able to recognize healthsherpa quotes both in their main plan searcher screen (where filters and everything else are), In a plan individual view and in plans comparison view"
- S2 — "so that I can take a screenshot and automatically recognize the plan name, company and premium of all plans on the screen"
- S3 — The plans go to the Obamacare quoted-plans list (Planes cotizados, `S.f.planes`), marked as read from a document; removing the screenshot removes them; a plan already in the list is not added twice. (Assumption: derived from how the app already handles lists read from documents.)
- S4 — The premium is the one the client pays (after the subsidy), not the struck-through price. (Assumption.)
- S5 — Works with HealthSherpa in English and in Spanish. (Assumption: the site has an Español switch and agents may use it.)
- S6 — The carrier filter list, the compare bar and other screen text are never read as plans.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1, S2, S4, S5, S6 | inline | done | 209/209 tests; 8 real screenshots read; 40 fixtures unchanged vs c01b9b8 |
| T2 | S2, S3 | inline | done | 210/210 tests; 120 fixture runs unchanged vs c01b9b8; in-app run in Brave |
| T3 | S1–S6 | inline | done | README section; dist rebuilt and signed |

- T1: OCR words mode (sparse page segmentation with positions) and the geometric reader `quotePlans(words)` plus the `oc_quote` type, detection and a text fallback; tests with real screenshots.
- T2: app integration: second OCR pass for HealthSherpa screens, merge into Planes cotizados, removal, outcome handling.
- T3: README, build, check in the browser with screenshots.

## Log

- L1 (2026-11-16, user): "Errors I noticed: - It recognizes the phone number in app summary but it doesn't add it to the Teléfono del titular field. Same with Email del titular. So when I add them it mistakenly adds them as Cambios on the note - Also since we use healthserpa to quote, make it be able to recognize healthsherpa quotes both in their main plan searcher screen (where filters and everything else are), In a plan individual view and in plans comparison view so that I can take a screenshot and automatically recognize the plan name, company and premium of all plans on the screen"
- L2 (user): "You don't need it, at the bottom of the login page you'll see the link to quote without login"
- L3 (evidence): browsed the public quote flow with a made-up household (ZIP 33101, one adult of 40, income $35,000). Carriers appear as logos (Florida Blue script logo is unreadable by OCR; Ambetter is a small pink circle). The app's OCR reads screenshots as one column (page segmentation 4), which merges the filter sidebar into the cards and loses names; automatic layout (3) separates columns but drops compare premiums. Sparse mode (11) with word positions reads all three views well, so the reader works on word boxes, not lines.
- L4 (evidence): carrier sources, in order: carrier list on the plan name (myBlue/BlueCare/BlueSelect/BlueOptions, UHC, AvMed, Wellpoint, AmeriHealth), the carrier's legal name under each column in compare view and logo text next to the name, then plan-family hints for Oscar ("Bronze Simple/Classic/Elite…") and Ambetter ("Signature/Everyday/Focused/Thrive/Complete… Bronze/Silver/Gold").
- L5 (T1): reader built against the real OCR of 10 screens (list, list with filters, list with compare bar, Spanish list, plan view EN/ES, compare EN/ES, most affordable): every plan with the right premium and carrier. The tests were written after the reader (no RED first): the screenshots were the spec. Known limits: small-font OCR errors stay in names ("2707-30" for "27M07-30" in the list at 1568 px); at 67% browser zoom the downscaled JPEGs read nothing in Node, which does not enlarge images like the app does (checked in the app in T3). A PowerShell resize to emulate the app's 2x enlargement was blocked by the permission classifier.
- L6 (T2): app integration. Images whose OCR text is detected as `oc_quote` are read again with `OCR.readImage(file, { words: true })`; `applyExtraction` merges `planes` into Planes cotizados (marked `auto`, no repeated plan name, the empty starting row replaced) and switches the outcome to Pendiente, which the ✕ restores. Decision (assumption, no user input): with App enviada and a single plan on screen (a plan's page), that plan fills the Plan section instead.
- L7 (evidence, Brave on localhost): dropped the fixture screenshots into the app (synthetic drop of a PNG made from the image, since the app's CSP blocks fetch): list views read every card with carrier and premium in 9–11 s, 27M07-30 read right thanks to the app's 2x enlargement; removing the screenshot empties the list and puts App enviada back.
- L8: Next: finish the in-app run (compare, zoomed-out screens), then commit T2 and T3 docs.
- L9 (evidence): fixed the reader for a plan name on two lines (AmeriHealth, now a test with healthsherpa-list-two-lines.jpg) and for carrier logo text next to a plan title (a short brand-only line ends the name). In the app at 100% zoom every screen reads right. At 67% zoom the OCR itself garbles the words ("nN thy promi" for "Monthly premium"), so cards there lose names or are missed; the README asks for 100%. When the word reader finds nothing, the text reading may still give one plan, which on App enviada fills the Plan section like a plan page would.
