# Publishing the academic website

## One release, two hosts

Run `npm run prepare:release` to check the site and build `dist/`.
The checks do not regenerate or overwrite approved pages.
`dist/` contains only allowlisted public pages, assets, book chapters, papers,
and JSON data. `_release.json` records the commit and file hashes.

The three legacy Windows launchers now call `scripts/publish.ps1`. They validate
before staging, require `master`, and stop on errors. They never deploy locally
to Tencent CloudBase or force-push. A push to `master` runs the workflow:

1. Run all checks and package the public files once.
2. Upload the same immutable artifact to GitHub Pages and Tencent CloudBase.
3. Verify each deployed manifest plus representative page and asset hashes.

GitHub Pages must use **GitHub Actions** as its publishing source, not the
legacy root-of-branch builder. CloudBase uses the existing repository secrets
`CLOUDBASE_ENV_ID`, `TENCENTCLOUD_SECRET_ID`, and `TENCENTCLOUD_SECRET_KEY`.
Do not place secret values in repository files or logs.

## Files excluded

- `.codex_tmp/`, `output/`, `dist/`, editor folders, caches and local logs
- `.env*`, private key files and local CloudBase configuration
- `node_modules/`

The public artifact additionally excludes Git metadata, development scripts,
Markdown instructions, test fixtures, and Windows launchers even when those
belong in the source repository. It includes both Join Us pages and English
book pages; no manual per-page Tencent upload list is needed.

The uploader does not delete unrelated existing remote objects. Verify the
workflow run and both live releases after each push. A successful Git push
alone does not mean either host has finished deploying.
