/* Local-only CV build bridge. No deployment, shell expansion, or background worker. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'CV', 'latex', 'scripts', 'update_cv.py');
const args = process.argv.slice(2);
try { require('./check-corresponding-authors').checkVerifiedAuthors(root); }
catch (error) { console.error(error.message); process.exit(2); }
if (!fs.existsSync(script)) {
  console.error('CV source is not present in this checkout. It is currently local-only; do not publish the entire CV folder to work around this.');
  process.exit(2);
}
const bundled = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const candidates = process.env.CV_PYTHON
  ? [[process.env.CV_PYTHON, []]]
  : [...(fs.existsSync(bundled) ? [[bundled, []]] : []), ['python3', []], ['python', []], ...(process.platform === 'win32' ? [['py', ['-3']]] : [])];
const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
const probe = 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)';
const runtime = candidates.find(([exe, prefix]) => spawnSync(exe, [...prefix, '-c', probe], { env, windowsHide: true, stdio: 'ignore', timeout: 10000 }).status === 0);
if (!runtime) {
  console.error('Python 3.10+ was not found. Set CV_PYTHON to an existing interpreter; this command does not install software.');
  process.exit(2);
}
const result = spawnSync(runtime[0], [...runtime[1], script, ...args], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(Number.isInteger(result.status) ? result.status : 2);
