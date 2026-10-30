# Project report (LaTeX)

Written for [Overleaf](https://www.overleaf.com); no local TeX installation is needed.

## Use on Overleaf

1. Overleaf → **New Project → Upload Project** → upload a ZIP of this `docs/report` folder.
2. Open `preamble.tex` and fill in the details at the top (your name, roll number, programme, guide, academic year).
3. Set **Menu → Main document** to one of the files below and press **Recompile**. Use *pdfLaTeX* (default).

| Main document | Output |
|---|---|
| `main.tex` | The complete report (front matter, all chapters, appendices) |
| `feasibility-study.tex` | Feasibility study |
| `srs.tex` | Software Requirements Specification |
| `spmp.tex` | Software Project Management Plan |
| `design-document.tex` | System design (diagrams and flowcharts) |
| `test-report.tex` | Test plan and report |
| `user-manual.tex` | User manual |

The chapters live in `chapters/`. All diagrams are drawn with TikZ, so they stay sharp and need no image files.
Cross-references between chapters show as `??` in the single-chapter documents; they resolve in `main.tex`.
