# PDF.js for the local CV preview

Pinned version: 6.4.299. License: Apache-2.0 (see LICENSE.txt).

Source: https://github.com/mozilla/pdf.js
Distribution: https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/

The two bundled ES modules are unchanged except for the .js filenames, for compatibility with existing static hosting MIME types and release rules. The worker URL is explicitly configured by en-home.js. These files load only when a reader opens the CV preview. No PDF is sent to a third-party viewer.

- `pdf.min.js`: 458904 bytes; SHA-256 `57456c8e0c81e46be31174b499ef77f2b9f5ee46d04412ba627320a36755d4c2`; original `build/pdf.min.mjs`.
- `pdf.worker.min.js`: 1264342 bytes; SHA-256 `9536359f1b8367850d485731ca1d5e45c159a7b7a0912325e539937aa21ceb18`; original `build/pdf.worker.min.mjs`.
- `LICENSE.txt`: 10174 bytes; SHA-256 `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594`; original `LICENSE`.
