"""One-command local CV workflow: website delta -> Markdown -> existing TeX -> PDF.

No scheduler, background process, Git command, upload, or deployment is started.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil
import sys
import tempfile

from build import ROOT, build, render
from compile_pdf import compile_pdf
from sync_website import REPO, load_json, plan_all, print_summary, synchronize

PUBLIC_CV = Path("static/assets/cv/jie-yang-cv.pdf")


def digest(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def ensure_editor_safe(cv_root):
    tex = cv_root / "cv.tex"
    if not tex.exists():
        return
    manifest = cv_root / "cv.build.json"
    if manifest.exists():
        safe = load_json(manifest).get("tex_sha256") == digest(tex)
    else:
        expected = (cv_root / "templates/layout.tex").read_text(encoding="utf-8-sig").replace("%%CV_BODY%%", render((cv_root / "content.md").read_text(encoding="utf-8-sig")))
        safe = tex.read_text(encoding="utf-8-sig") == expected
    if not safe:
        raise ValueError("cv.tex has edits not recorded by the generator. Move those edits to content.md/layout.tex before rebuilding; the editor file was not overwritten.")


def public_cv_path(repo):
    """An exact, public-PDF-only target; never copy the CV source tree."""
    repo = Path(repo).resolve()
    asset_root = repo / "static" / "assets"
    public = repo / PUBLIC_CV
    for parent in (repo / "static", asset_root, public.parent):
        if parent.exists() and parent.is_symlink():
            raise ValueError("Public CV target may not traverse a symbolic link")
    if public.exists() and public.is_symlink():
        raise ValueError("Public CV PDF may not be a symbolic link")
    if not public.parent.resolve().is_relative_to(asset_root.resolve()):
        raise ValueError("Public CV target escapes the intended static assets directory")
    return public


def refresh_public_pdf(repo, pdf):
    """Copy just the completed PDF; the private CV directory is never staged."""
    source = Path(pdf).resolve()
    target = public_cv_path(repo)
    if source.read_bytes()[:5] != b"%PDF-":
        raise ValueError("Generated CV is not a PDF")
    if target.exists() and digest(target) == digest(source):
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".cv-copy-", suffix=".tmp", delete=False) as staged:
        temp = Path(staged.name)
    try:
        shutil.copyfile(source, temp)
        if digest(temp) != digest(source):
            raise IOError("Public PDF copy does not match the generated CV")
        temp.replace(target)
    finally:
        if temp.exists():
            temp.unlink()
    return target


def check_current(repo, cv_root, tex_only=False):
    merged, _, report, _ = plan_all(repo, cv_root)
    expected = (cv_root / "templates/layout.tex").read_text(encoding="utf-8-sig").replace("%%CV_BODY%%", render(merged))
    tex = cv_root / "cv.tex"
    current = not (report["content_changed"] or report["state_changed"]) and tex.exists() and tex.read_text(encoding="utf-8-sig") == expected
    if not tex_only:
        pdf, receipt = cv_root / "cv.pdf", cv_root / "cv.pdf.build.json"
        if not current or not pdf.exists() or not receipt.exists():
            current = False
        else:
            recorded = load_json(receipt)
            public = public_cv_path(repo)
            current = (recorded.get("tex_sha256") == digest(tex)
                       and recorded.get("pdf_sha256") == digest(pdf)
                       and public.is_file() and digest(public) == digest(pdf))
    return current, report


def update(repo=REPO, cv_root=ROOT, check=False, tex_only=False, offline=False, compiler=None):
    repo, cv_root = Path(repo), Path(cv_root)
    if check:
        current, report = check_current(repo, cv_root, tex_only)
        print_summary(report)
        print("CV is current." if current else "CV needs an update; no files were changed.")
        return 0 if current else 1
    ensure_editor_safe(cv_root)
    report = synchronize(repo, cv_root)
    print_summary(report)
    tex = build(cv_root / "content.md", cv_root / "templates/layout.tex", cv_root / "cv.tex")
    print("Updated existing TeX:", tex)
    if tex_only:
        print("PDF was not compiled; it may still show the previous version.")
        return 0
    pdf = compile_pdf(tex, cv_root, compiler, offline)
    public_pdf = refresh_public_pdf(repo, pdf)
    receipt = {"tex_sha256": digest(tex), "pdf_sha256": digest(pdf)}
    (cv_root / "cv.pdf.build.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("Updated existing PDF:", pdf)
    print("Updated website PDF candidate (not deployed):", public_pdf)
    print("No Git commit, push, upload or deployment was performed.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Read-only freshness check; exit 1 if stale")
    parser.add_argument("--tex-only", action="store_true", help="Sync and rebuild TeX without touching the PDF")
    parser.add_argument("--offline", action="store_true", help="Compile using cached TeX resources only")
    parser.add_argument("--compiler", help="Existing Tectonic executable")
    args = parser.parse_args()
    try:
        raise SystemExit(update(check=args.check, tex_only=args.tex_only, offline=args.offline, compiler=args.compiler))
    except Exception as exc:
        print(f"CV update failed: {exc}\nNo publication was attempted. If the PDF is open, close its reader and run this command again.", file=sys.stderr)
        raise SystemExit(2)
