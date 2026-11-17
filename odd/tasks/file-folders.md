Objective: let the agent choose the folder for each kind of file, and save the Hoja de cambios as a PDF straight into its folder.
Branch: style/navy-dark (unreleased work rides with the navy theme). Delivery: single-pr. Test runner: `node --test tests/*.test.js`.

## Specs
- S1. "for the OC files (my plan and programs, eligibility, app-summary, consent and submitted docs) i use one folder (e.g. OC/), for the change sheet i use a "OC/OEP - Hoja de Cambios", so my point is i would like the user to be able to choose where every file goes"
  - Each document kind of a line (its Network list, plus the Hoja de cambios for OC) can have its own folder; without one it uses the line's folder, then the general one.
- S2. The Hoja de cambios can be saved as a PDF file into its folder (assumption: a text PDF drawn by the app, so names and codes can still be copied; "Imprimir o guardar PDF" stays).

## Tasks
- T1 (S2) Change sheet PDF writer `js/sheetpdf.js`, pure and tested in node. Route: inline. Status: done (tests/sheetpdf.test.js; rendered 1- and 2-page samples and checked them visually).
- T2 (S1, S2) Per-document folders: resolution in notes.js, Ajustes UI, saving per job, "Guardar en la carpeta" on the Hoja de cambios. Route: inline. Status: done (tests/notes.test.js netDirFor/docKinds; preview check with a fake folder picker: the sheet PDF landed in the Hoja de cambios folder, the Guardar title and Ajustes rows show the per-document folders).

## Log
- L1 (2026-11-16) User: "Also for the OC files (my plan and programs, eligibility, app-summary, consent and submitted docs) i use one folder (e.g. OC/), for the change sheet i use a "OC/OEP - Hoja de Cambios", so my point is i would like the user to be able to choose where every file goes"
- L2 Folders today are per line (general, oc, mc, supp) in notes.js NET_DIRS/netDirFor; the sheet only prints. No PDF library is bundled (forms.js patches existing PDFs), so T1 writes a minimal PDF with the standard Helvetica fonts.
- L3 T2: folder keys are `line:kind` (kind without its `:variant`), resolved kind → line → general in netDirFor; Ajustes lists each line's kinds in a collapsible "Carpeta por documento". Each saved job and the sheet use ensureNetDir(kind). Next: release with the navy-theme branch when the user says ship.
