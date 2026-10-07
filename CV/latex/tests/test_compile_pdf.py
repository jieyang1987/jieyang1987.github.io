from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from compile_pdf import command, compile_pdf, find_compiler


class LocalCompileTests(unittest.TestCase):
    def test_arguments_are_separate_and_untrusted(self):
        args = command(Path("C:/Programs with spaces/tectonic.exe"), Path("D:/CV folder/cv.tex"), Path("D:/PDF output"), True)
        self.assertEqual(args[0], str(Path("C:/Programs with spaces/tectonic.exe")))
        self.assertIn("--untrusted", args)
        self.assertIn("--only-cached", args)
        self.assertEqual(args[-1], str(Path("D:/CV folder/cv.tex")))

    def test_explicit_missing_compiler_does_not_silently_fallback(self):
        with self.assertRaises(FileNotFoundError): find_compiler("nonexistent-cv-compiler-123.exe")

    def test_source_required_before_compilation(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError): compile_pdf(Path(tmp) / "missing.tex")

    def test_explicit_compiler_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / "compiler.exe"
            exe.write_bytes(b"test fixture")
            self.assertEqual(find_compiler(str(exe)), exe.resolve())

    def test_existing_source_is_not_rebuilt_or_changed(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "cv.tex"
            source.write_text("editor changes must survive", encoding="utf-8")
            binary = Path(tmp) / "tectonic.exe"
            binary.write_bytes(b"test fixture")
            def fake_run(args, **kwargs):
                self.assertTrue(kwargs["check"])
                self.assertNotIn("shell", kwargs)
                (Path(tmp) / "cv.pdf").write_bytes(b"%PDF-test")
            with patch("compile_pdf.subprocess.run", side_effect=fake_run):
                result = compile_pdf(source, Path(tmp), str(binary), True)
            self.assertEqual(result, Path(tmp) / "cv.pdf")
            self.assertEqual(source.read_text(encoding="utf-8"), "editor changes must survive")


if __name__ == "__main__":
    unittest.main()
