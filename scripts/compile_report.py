#!/usr/bin/env python3
"""
Compiles the complete consolidated LaTeX project report into a single PDF:
  docs/report/output/Campus_E-Voting_Project_Report.pdf
Requires Docker with ghcr.io/xu-cheng/texlive-small:latest.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
REPORT_DIR = ROOT_DIR / "docs" / "report"
OUTPUT_DIR = REPORT_DIR / "output"
FINAL_PDF_NAME = "Campus_E-Voting_Project_Report.pdf"


def main():
    if not REPORT_DIR.exists():
        print(f"Error: {REPORT_DIR} does not exist", file=sys.stderr)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Compiling complete project report ({REPORT_DIR / 'main.tex'}) via Docker...")
    work_mount = str(REPORT_DIR.resolve()).replace("\\", "/")

    # Build the in-container compile commands for main.tex
    compile_cmds = [
        "tlmgr install --force titlesec",
        "pdflatex -interaction=nonstopmode main.tex > /dev/null",
        "pdflatex -interaction=nonstopmode main.tex > /dev/null",
        "rm -f *.aux *.log *.out *.toc *.lof *.fls *.fdb_latexmk",
    ]

    inner_script = " && ".join(compile_cmds)
    cmd = [
        "docker",
        "run",
        "--rm",
        "-v",
        f"{work_mount}:/work",
        "-w",
        "/work",
        "ghcr.io/xu-cheng/texlive-small:latest",
        "sh",
        "-c",
        inner_script,
    ]

    res = subprocess.run(cmd)
    if res.returncode != 0:
        print(f"Compilation exited with code {res.returncode}", file=sys.stderr)
        sys.exit(res.returncode)

    built_pdf = REPORT_DIR / "main.pdf"
    target_pdf = OUTPUT_DIR / FINAL_PDF_NAME

    if built_pdf.exists():
        shutil.move(str(built_pdf), str(target_pdf))
        size_kb = target_pdf.stat().st_size / 1024.0
        print(f"\n[OK] Successfully generated single unified report PDF:")
        print(f"     Path: {target_pdf}")
        print(f"     Size: {size_kb:.1f} KB")
    else:
        print(f"Error: {built_pdf} was not generated", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
