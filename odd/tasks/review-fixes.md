# Review fixes: documents to fields and Cambios

Objective: fix the confirmed defects two read-only reviews found in how documents fill the form and how the note reports Cambios.
Branch: fix/review-findings (stacked on fix/app-summary-household). Delivery: single chain, merged with the rest. Runner: `node --test tests/*.test.js`.

## Specs

- S1 — "spot any other hidden errors like these" (the class: data read from a document that never reaches its field, lands in the wrong field or person, or makes Cambios wrong).
- S2 — "Remember it has to apply everything it finds from the last application submitted so that any change is recognized as a Cambio on the note". Assumption: when two documents disagree, the one dropped last wins (and becomes the Cambios baseline); what the agent typed by hand is never overwritten.
- S3 — Fields that start with a default (plan year, product, platform, Medicare period, the client's gender in the note) take the document's value.
- S4 — Each household member gets their own data: the titular never gets another person's income or DOB; a household income from the Eligibility Letter never adds on top of the per-person incomes of an App Summary; the same person is never listed twice (titular with a longer Zoho name, first name only, renamed by hand).
- S5 — Removing a document undoes only what that document filled: hand-typed values stay, Cambios against the remaining documents stay, and the line and outcome a document changed still go back.
- S6 — A payment receipt is read for the product of the application dropped with it, in either order.
- S7 — Medicare and supplemental applications fill the client's phone, email and address like the App Summary does.
- S8 — Cambios compare phones and DOBs by meaning, not format.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S2, S3 | inline | done | cf044b5; gender tests; an Accident app reads Accident in the app |
| T2 | S4, S5 | inline | done | 5e6cbdd; 6 notes tests, 1 extract test; letter then App Summary gives $31,200 in the app |
| T3 | S5, S6 | inline | done | c06e361; receipt before its app keeps the payment, line returns to oc after removals (in the app) |
| T4 | S7 | inline | done | 8313832; contact on 7 mc/supp fixtures; guard tests; differential only on intended fixtures |
| T5 | S8 | inline | done | 4d538b9; parseBirth and phone tests |

- T1: defaults are replaceable by documents; a later document of equal rank replaces an earlier one; gender from "Sex".
- T2: household: titular section in the extractor; per-person, per-field document ranks instead of `tit.auto`; person matching shared by mergePersonas and mergeHousehold; Cambios baseline rebuilt on replay; hogarPdf for single-person applications; quitados cleared with the last document.
- T3: line switch by a document re-reads line-less documents (payments) for the new line and keeps their data; lineFrom/outcomeFrom survive a replay; switching line clears the Network ticks and the household members documents added.
- T4: mc/supp contact fields; App Summary contact never read from the agent block; payment amount/date fallbacks skip due amounts and birth dates; "month" misread by OCR.
- T5: DOB typed with a two-digit year is a birth year; phones compare by their last 10 digits.

Deferred (reported, not fixed here): documents or plans the agent deleted come back when another file is removed; NO PREMIUM stays after removing the $0 document; an NPN with no name and no team match fills nothing (the note prints only initials).

## Log

- L1 (2026-11-16, user): "Wait till everything is ready then merge everything. Also Can you launch a deep review with fable 5.2 to spot any other hidden errors like these?"
- L2 (evidence): two Fable 5.2 reviewers (document → field mapping; note, Cambios and undo) reported 27 findings, most reproduced in node or the running app; deduplicated into T1–T5 plus the deferred list.
- L3 (evidence): 229/229 tests. Tests for T1-T5 were written right after each change (no RED observed first); app.js has no unit harness, so its wiring was checked in the app with fixture texts. Fixture differential vs 23daf88: only the mc/supp/App Summary fixtures whose expectations were updated changed.
