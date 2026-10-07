"""Compile the existing standalone CV with local Tectonic; never upload the source.

Run build.py first only when content.md or the layout template has changed.
This script intentionally does not overwrite edits in the open cv.tex editor.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def find_compiler(explicit=None):
    configured = explicit or os.environ.get("TECTONIC_BINARY")
    if configured:
        path = Path(configured).expanduser()
        if path.is_file(): return path.resolve()
        discovered = shutil.which(str(configured))
        if discovered: return Path(discovered)
        raise FileNotFoundError(f"Configured compiler not found: {configured}")
    discovered = shutil.which("tectonic")
    if discovered: return Path(discovered)
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        base = Path(local_app_data) / "Programs" / "Tectonic"
        # Prefer the verified version used for this CV, without changing system PATH.
        candidate = base / "0.17.0" / "tectonic.exe"
        if candidate.is_file(): return candidate
    raise FileNotFoundError("Tectonic not found. Pass --compiler PATH or set TECTONIC_BINARY. No automatic installation is performed.")


def command(compiler, source, outdir, offline=False):
    args = [str(compiler), "--untrusted", "--keep-logs", "--color", "never"]
    if offline: args.append("--only-cached")
    return args + ["--outdir", str(outdir), str(source)]


def compile_pdf(source=ROOT / "cv.tex", output_dir=ROOT, compiler=None, offline=False):
    source = Path(source).resolve()
    if not source.is_file(): raise FileNotFoundError(f"Source missing: {source}. Run build.py first.")
    binary = find_compiler(compiler)
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    local_fonts_config = binary.parent / "fonts.conf"
    if not env.get("FONTCONFIG_FILE") and local_fonts_config.is_file():
        env["FONTCONFIG_FILE"] = str(local_fonts_config)
    subprocess.run(command(binary, source, output_dir, offline), cwd=source.parent, check=True, env=env)
    pdf = output_dir / (source.stem + ".pdf")
    if not pdf.is_file() or pdf.stat().st_size == 0:
        raise RuntimeError("Compiler returned success but no non-empty PDF was produced")
    return pdf


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "cv.tex")
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    parser.add_argument("--compiler", help="Path to an existing Tectonic executable")
    parser.add_argument("--offline", action="store_true", help="Use only previously cached fonts/packages")
    args = parser.parse_args()
    try:
        print(compile_pdf(args.source, args.output_dir, args.compiler, args.offline))
    except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"Compilation failed: {error}", file=sys.stderr)
        sys.exit(1)
