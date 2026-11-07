# Project report (LaTeX)

Written for [Overleaf](https://www.overleaf.com) or local compilation via Docker.

## Generated Report PDF

The complete unified report PDF is compiled into the `output/` subfolder:
- **`docs/report/output/Campus_E-Voting_Project_Report.pdf`** (Complete 43-page report including front matter, all 7 chapters, and appendices)

To recompile locally at any time:
```bash
python scripts/compile_report.py
```

## Use on Overleaf

1. Overleaf → **New Project → Upload Project** → upload a ZIP of this `docs/report` folder.
2. Open `preamble.tex` (it is only included by the other files; never compile it) and fill in the details at the top (your name, roll number, programme, guide, academic year).
3. Set **Menu → Main document** to `main.tex` and press **Recompile**. Use *pdfLaTeX* (default).

The chapters live in `chapters/`. All diagrams are drawn with TikZ, so they stay sharp and need no image files.
