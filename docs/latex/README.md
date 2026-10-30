# Formal LaTeX Project Documentation Compilation Guide

**Project Title:** A Secure Campus e-Voting System with Cryptographic Secret Ballot Isolation, Physical Polling Desk 2FA, and Lab Kiosk Geofencing  
**Document:** `formal_project_report.tex`  
**Degree / Course:** B.Sc. Computer Science (Major), NEP 2020, Semester 5  
**Paper:** Software Engineering (Theory & Laboratory Capstone)  
**Document Class:** `report` (Standard A4, 12pt, 1.5 line spacing, University Submission Standard)  

---

## 1. Quick Overview of the Document

The file `formal_project_report.tex` is a complete, self-contained, formal university-standard project report covering all 7 curriculum units of the Software Engineering syllabus:

- **Front Matter:** Formal Title Page, Certificate of Authenticity, Abstract, Table of Contents, List of Tables, List of Figures.
- **Chapter 1: Introduction & Feasibility Analysis:** Problem statement, vulnerabilities of paper & remote voting, technical feasibility (React 18 + Flask + PostgreSQL), economic feasibility (CapEx ₹67,275, OpEx ₹22,500, Payback period 0.405 election cycles, 3-year ROI 639.8%), operational/legal feasibility.
- **Chapter 2: Software Requirements Specification (IEEE Std 830-1998):** Numbered functional requirements (F1 through F25), voting eligibility decision table, verified non-functional requirements (Availability $\ge 99.9\%$, response time $<1.5\text{ s}$, strict ACID isolation).
- **Chapter 3: System Architecture & Cryptographic Isolation:** Tiered architecture, physical desk 2FA with 6-digit random PIN (20-minute TTL), lab kiosk geofencing with hardware tokens, mathematical proof of secret ballot decoupling ($\mathbb{P}(b.\text{choice} \mid v.\text{id}) = \mathbb{P}(b.\text{choice})$), multi-position ballots with NOTA mechanics.
- **Chapter 4: Software Project Management Plan (SPMP):** 4-increment evolutionary lifecycle, Function Point Analysis (119 UFP, VAF 1.15, Adjusted FP $\approx 135\text{ FP}$), COCOMO Organic estimation ($3.8\text{ KLOC}$, Effort $9.72\text{ person-months}$, Duration $5.92\text{ months}$ compressed into 12-week semester), WBS, Critical Path Method (CPM with Float and Critical Path $A \to B \to D \to E \to F \to G \to H \to I \to J$), and ISO 9001 quality gates.
- **Chapter 5: System Design & Database Schema:** Context Level-0 and Level-1 DFDs, physical relational schemas for all 9 tables (`users`, `elections`, `positions`, `candidates`, `voting_tokens`, `kiosk_devices`, `voter_records`, `ballot_entries`, `audit_logs`), and UML sequence diagram of desk-to-kiosk voting flow.
- **Chapter 6: Software Testing & Verification:** Black-box Equivalence Class Partitioning (ECP) and Boundary Value Analysis (BVA), White-box Control Flow Graph (CFG) and Cyclomatic Complexity ($V(G) = 7$) for `cast_multi_position_vote()`, basis path testing, reliability metrics ($MTTF \approx 9.993\text{ hrs}$, $MTTR = 24\text{ s}$, Availability $A = 99.933\%$), and defect tracking log.
- **Chapter 7: Election Commissioner & Polling Staff User Manual:** Step-by-step guides for polling desk officers (verifying ID, issuing 20-min slips), lab administrators (authorizing kiosk terminals), student voters (casting multi-position ballots with NOTA), and election commissioners (tallying results, handling NOTA majority reelection triggers, exporting signed audit ledgers).
- **Back Matter:** Conclusion & Future Directions, and formal academic bibliography conforming to IEEE citation style.

---

## 2. Compilation Methods

### Method A: Overleaf (Recommended / Zero Installation)

1. Open [Overleaf](https://www.overleaf.com/) in any modern web browser.
2. Click **``New Project''** $\to$ **``Blank Project''** (name it `CEVS_Project_Report`).
3. Delete the default `main.tex` file.
4. Upload `formal_project_report.tex` into the project (or rename it to `main.tex`).
5. Ensure compiler is set to **pdfLaTeX** (default in Overleaf Settings).
6. Click **``Recompile''**.
7. Download the certified output PDF.

---

### Method B: Local Command Line (TeX Live / MacTeX / MiKTeX)

Open a terminal or command prompt in `D:\Codes\Projects\EVoting\docs\latex\`:

#### Using `pdflatex` (Two passes required for Table of Contents and References):
```bash
# First pass (generates .aux, .toc, .lot, .lof)
pdflatex formal_project_report.tex

# Second pass (resolves cross-references and page numbers)
pdflatex formal_project_report.tex
```

#### Using `latexmk` (Automated build tool):
```bash
latexmk -pdf formal_project_report.tex
```

To clean auxiliary build files (`.aux`, `.log`, `.toc`, `.lot`, `.lof`, `.out`):
```bash
latexmk -c
# Or on Windows PowerShell:
Remove-Item *.aux, *.log, *.toc, *.lot, *.lof, *.out -ErrorAction SilentlyContinue
```

---

### Method C: VS Code with LaTeX Workshop Extension

1. Install the **LaTeX Workshop** extension in Visual Studio Code.
2. Open `D:\Codes\Projects\EVoting\docs\latex\formal_project_report.tex`.
3. Press `Ctrl + Alt + B` (or `Cmd + Alt + B` on macOS) to build.
4. Press `Ctrl + Alt + V` to view the compiled PDF in side-by-side split screen.

---

## 3. Required LaTeX Packages

All packages used are standard packages included in all standard TeX distributions (`texlive-latex-base`, `texlive-latex-recommended`, `texlive-pictures`):

- `geometry`: Document margins and geometry layout.
- `setspace`: 1.5 line spacing (`\onehalfspacing`).
- `amsmath`, `amssymb`, `amsthm`: Mathematical formulas, theorems, and definitions.
- `booktabs`, `longtable`, `tabularx`, `array`, `multirow`: Professional university tables.
- `tikz`: Architecture, DFD, and UML sequence diagrams.
- `listings`, `xcolor`: Code syntax highlighting with professional academic palette.
- `fancyhdr`: Custom running headers and footers.
- `titlesec`: Professional chapter headings with rules.
- `hyperref`: Hyperlinked table of contents, citations, and URLs.
