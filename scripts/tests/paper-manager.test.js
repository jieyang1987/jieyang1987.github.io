'use strict';

// Run the real HTTP server against a disposable fixture, never the site's data.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

async function startFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-manager-test-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill();
      await closed;
    }
    const target = path.resolve(root);
    if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('paper-manager-test-')) {
      throw new Error('Unsafe fixture cleanup path');
    }
    fs.rmSync(target, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.cpSync(path.join(__dirname, '..', 'paper-manager'), path.join(root, 'scripts', 'paper-manager'), { recursive: true });
  fs.cpSync(path.join(__dirname, '..', 'chrome-paper-helper'), path.join(root, 'scripts', 'chrome-paper-helper'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'publications'), { recursive: true });
  fs.mkdirSync(path.join(root, 'papers'));
  fs.copyFileSync(path.join(__dirname, '..', 'paper-manager.js'), path.join(root, 'scripts', 'paper-manager.js'));
  fs.copyFileSync(path.join(__dirname, '..', 'add-paper.js'), path.join(root, 'scripts', 'add-paper.js'));
  fs.writeFileSync(path.join(root, 'data', 'publications.json'), JSON.stringify({
    yearlyFiles: [{ year: 2026, file: 'data/publications/2026.json' }], filterTopics: [],
  }));
  const yearFile = path.join(root, 'data', 'publications', '2026.json');
  const original = {
    authors: '<strong>J. Yang*</strong>, M. Sawan*', title: 'Original title',
    venue: 'Test Journal', venueHighlight: true, url: 'https://example.com/paper',
    pdf: 'papers/test.pdf', topics: ['bci'], abstract: 'Existing abstract',
    award: 'Best Paper Award', titleEn: 'English title', venueEn: 'English venue',
    futureMetadata: { tags: ['keep'], reviewed: true },
  };
  const otherPaper = { title: 'Another paper', authors: 'A. Smith', award: 'Keep too' };
  function reset() {
    fs.writeFileSync(yearFile, JSON.stringify({
      journals: [{ year: 2026, items: [original, otherPaper] }], conferences: [],
    }, null, 2) + '\n');
  }
  reset();

  // Obtain an available port; each fixture runs in its own child process.
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  child = spawn(process.execPath, [path.join(root, 'scripts', 'paper-manager.js'), '--port', String(port)], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Fixture server startup timed out: ' + output)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Fixture server exited: ' + code + '\n' + output)); });
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('http://localhost:' + port)) { clearTimeout(timer); resolve(); }
    });
  });
  return {
    original, otherPaper, reset,
    readYear: year => JSON.parse(fs.readFileSync(path.join(root, 'data', 'publications', year + '.json'), 'utf8')),
    readConfig: () => JSON.parse(fs.readFileSync(path.join(root, 'data', 'publications.json'), 'utf8')),
    post: async (route, body, extraHeaders = {}) => {
      const response = await fetch('http://127.0.0.1:' + port + route, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
      });
      return { status: response.status, body: await response.json() };
    },
    read: () => JSON.parse(fs.readFileSync(yearFile, 'utf8')),
    save: async fields => {
      const response = await fetch('http://127.0.0.1:' + port + '/api/paper', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '2026/journals/0', groupYear: 2026, ...fields }),
        signal: AbortSignal.timeout(5000),
      });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      assert.equal(result.ok, true);
      return result.paper;
    },
  };
}

test('paper updates preserve stored metadata through the HTTP API', async t => {
  const fixture = await startFixture(t);
  await t.test('a partial edit retains awards, translations, future fields and omitted abstract', async () => {
    fixture.reset();
    const saved = await fixture.save({ title: 'Edited title' });
    assert.deepEqual(saved, { ...fixture.original, title: 'Edited title' });
    assert.deepEqual(fixture.read().journals[0].items, [saved, fixture.otherPaper]);
  });
  await t.test('a full editor save retains extra fields and normalizes submitted authors', async () => {
    fixture.reset();
    const edited = {
      authors: 'Jie Yang, M. Sawan*', title: 'Edited', venue: 'New venue',
      venueHighlight: false, url: '', pdf: '', topics: [], abstract: '  New abstract  ',
    };
    const saved = await fixture.save(edited);
    assert.deepEqual(saved, { ...fixture.original, ...edited,
      authors: '<strong>J. Yang</strong>, M. Sawan*', abstract: 'New abstract' });
    assert.deepEqual(fixture.read().journals[0].items[0], saved);
  });
  for (const abstract of ['', '   ', null]) {
    await t.test('an explicitly cleared abstract is removed: ' + JSON.stringify(abstract), async () => {
      fixture.reset();
      const saved = await fixture.save({ abstract });
      const expected = { ...fixture.original };
      delete expected.abstract;
      assert.deepEqual(saved, expected);
      assert.deepEqual(fixture.read().journals[0].items[0], expected);
    });
  }
  await t.test('unrecognized request fields cannot overwrite stored metadata or leak into JSON', async () => {
    fixture.reset();
    const saved = await fixture.save({
      award: 'Overwrite attempt', titleEn: 'Overwrite attempt',
      futureMetadata: { reviewed: false }, file: 'outside.json', index: 99, unexpected: true,
    });
    assert.deepEqual(saved, fixture.original);
    assert.deepEqual(fixture.read().journals[0].items[0], fixture.original);
  });
});


test('URL-import drafts create the correct year and reject duplicate identities', async t => {
  const fixture = await startFixture(t);
  const original = fixture.read();
  const draft = { year: 2027, section: 'journals', title: 'New publication', authors: 'Jie Yang, M. Sawan*',
    venue: 'Journal', url: 'https://ieeexplore.ieee.org/document/12345', doi: '10.1234/example', abstract: 'Verified abstract', topics: ['bci'] };
  const added = await fixture.post('/api/paper/create', draft);
  assert.equal(added.status, 200);
  assert.equal(added.body.file, 'data/publications/2027.json');
  assert.equal(added.body.paper.authors, '<strong>J. Yang</strong>, M. Sawan*');
  assert.equal(added.body.paper.doi, '10.1234/example');
  assert.equal(fixture.readConfig().yearlyFiles[0].year, 2027);
  assert.equal(fixture.readYear(2027).journals[0].items.length, 1);
  assert.deepEqual(fixture.read(), original);
  for (const url of ['https://ieeexplore.ieee.org/abstract/document/12345/', 'https://doi.org/10.1234/example']) {
    const duplicate = await fixture.post('/api/paper/create', { ...draft, doi: '', url });
    assert.equal(duplicate.status, 400);
    assert.equal(duplicate.body.duplicates[0].id, added.body.id);
  }
  assert.equal(fixture.readYear(2027).journals[0].items.length, 1);
  const invalid = await fixture.post('/api/paper/create', { ...draft, year: null, url: 'https://example.org/new' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(fixture.read(), original);
  const unsafe = await fixture.post('/api/import-url', { url: 'http://127.0.0.1' });
  assert.equal(unsafe.body.ok, false);
  const crossOrigin = await fixture.post('/api/import-url', { url: 'https://example.org' }, { Origin: 'https://untrusted.example' });
  assert.equal(crossOrigin.status, 403);
});


test('single-field author formatting is read-only, consistent and preserves explicit stars', async t => {
  const fixture = await startFixture(t);
  const before = fixture.read();
  const cases = [
    ['Wei Zou, Mohamad Sawan*, Kwang-Ting Cheng', 'W. Zou, M. Sawan*, K-T. Cheng'],
    ['Albert Einstein, Marie Curie*, John Ronald Reuel Tolkien', 'A. Einstein, M. Curie*, J. R. R. Tolkien'],
    ['Jie Yang, Wei Zou, Mohamad Sawan*', '<strong>J. Yang</strong>, W. Zou, M. Sawan*'],
    ['Yang Jie*, Chi-Ying Tsui', '<strong>J. Yang*</strong>, C-Y. Tsui'],
    ['Yang, Jie*, Sawan, Mohamad*', '<strong>J. Yang*</strong>, M. Sawan*'],
    ['J.Yang, W.Zou, Y.H.Chen', '<strong>J. Yang</strong>, W. Zou, Y. H. Chen'],
    ['J.-H. Chen; Jie Yang and Mohamad Sawan', 'J-H. Chen, <strong>J. Yang</strong>, M. Sawan'],
    ['<strong>J. Yang*</strong>, W. Zou', '<strong>J. Yang*</strong>, W. Zou'],
    ['杨杰, 王伟', '<strong>J. Yang</strong>, 王伟'],
    ['Jie Yang；Wei Zou\nMohamad Sawan*', '<strong>J. Yang</strong>, W. Zou, M. Sawan*'],
    ['', ''],
  ];
  for (const [input, expected] of cases) {
    await t.test(input || 'empty input', async () => {
      const result = await fixture.post('/api/format-authors', { authors: input });
      assert.equal(result.status, 200);
      assert.equal(result.body.authors, expected);
      const repeated = await fixture.post('/api/format-authors', { authors: expected });
      assert.equal(repeated.body.authors, expected, 'formatting must be idempotent');
    });
  }
  for (const invalid of [null, 12, ['Jie Yang'], 'A'.repeat(20001)]) {
    const result = await fixture.post('/api/format-authors', { authors: invalid });
    assert.equal(result.status, 400);
  }
  assert.deepEqual(fixture.read(), before, 'formatting must not save or touch other papers');
});


test('Chrome bridge HTTP routes require pairing and reject arbitrary web origins', async t => {
  const fixture = await startFixture(t);
  const origin = 'chrome-extension://' + 'a'.repeat(32);
  const denied = await fixture.post('/api/chrome/extension/claim', {}, { Origin: origin });
  assert.equal(denied.status, 403);
  const webDenied = await fixture.post('/api/chrome/extension/pair', {code:'bad',extensionId:'a'.repeat(32)}, {Origin:'https://untrusted.example'});
  assert.equal(webDenied.status, 403);
  const pairing = await fixture.post('/api/chrome/pairing', {downloadRoot:os.tmpdir()});
  assert.equal(pairing.status, 200);
  const paired = await fixture.post('/api/chrome/extension/pair', {code:pairing.body.code,extensionId:'a'.repeat(32)}, {Origin:origin});
  assert.equal(paired.status, 200);
  const token = paired.body.token;
  const wrongOrigin = await fixture.post('/api/chrome/extension/claim', {}, {Origin:'chrome-extension://'+'b'.repeat(32),Authorization:'Bearer '+token});
  assert.equal(wrongOrigin.status, 403);
  const added = await fixture.post('/api/paper/create', {year:2027,section:'journals',title:'Browser paper',authors:'A. Smith',venue:'IEEE Journal of Solid-State Circuits',url:'https://ieeexplore.ieee.org/document/12345'});
  const queued = await fixture.post('/api/chrome/jobs', {paperId:added.body.id});
  assert.equal(queued.status, 200);
  const claimed = await fixture.post('/api/chrome/extension/claim', {}, {Origin:origin,Authorization:'Bearer '+token});
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.job.id, queued.body.job.id);
  assert.equal(claimed.body.job.stagingFilename,'PaperManager/'+queued.body.job.id+'.pdf');
  const cancelled = await fixture.post('/api/chrome/cancel', {id:queued.body.job.id});
  assert.equal(cancelled.body.job.state,'cancelled');
});


test('Scholar routes remain local and a missing profile never initiates a network scan',async t=>{
 const f=await startFixture(t);const original=f.read();
 const status=await f.post('/api/scholar/check',{});assert.equal(status.status,200);assert.equal(status.body.configured,false);assert.equal(status.body.lastOutcome,'not_configured');
 const denied=await f.post('/api/scholar/check',{}, {Origin:'https://untrusted.example'});assert.equal(denied.status,403);
 const setting=await f.post('/api/scholar/settings',{enabled:false});assert.equal(setting.status,200);assert.equal(setting.body.enabled,false);
 assert.deepEqual(f.read(),original);
});
