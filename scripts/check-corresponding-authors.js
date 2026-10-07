/* Guard verified Jie Yang corresponding-author decisions; no network or mutation. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const plain = value => String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const normalize = value => plain(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const canonicalUrl = value => String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();

function ownerStar(authors) {
  const matches = [...plain(authors).matchAll(/(?:\bJ\.\s*Yang\b|\bJie\s+Yang\b|\bYang\s+Jie\b|杨杰)\s*(\*)?/gi)];
  if (matches.length !== 1) throw new Error('Verified owner is missing or ambiguous in author list');
  return Boolean(matches[0][1]);
}

function verifyRecords(ledger, papers) {
  if (ledger.version !== 1 || !Array.isArray(ledger.records)) throw new Error('Invalid authorship verification ledger');
  for (const record of ledger.records) {
    const matches = papers.filter(p => p.kind === record.kind && (
      normalize(p.title) === normalize(record.title) ||
      (record.source_url && canonicalUrl(p.url) === canonicalUrl(record.source_url))
    ));
    if (matches.length !== 1) throw new Error('Verified paper missing or ambiguous: ' + record.title);
    const ev = record.evidence || {};
    const explicitPDF = Boolean(ev.quote && Number.isInteger(ev.page) && ev.page > 0);
    const authorConfirmed = ev.kind === 'author_confirmation' && typeof ev.statement === 'string'
      && /通[讯信]作者/.test(ev.statement) && /^\d{4}-\d{2}-\d{2}$/.test(ev.confirmed_on);
    if (typeof record.owner_corresponding !== 'boolean' || !(explicitPDF || authorConfirmed)) {
      throw new Error('Explicit PDF or author-confirmation evidence is required: ' + record.title);
    }
    if (ownerStar(matches[0].authors) !== record.owner_corresponding) {
      throw new Error('Corresponding-author marker contradicts verified author-role evidence: ' + record.title);
    }
  }
  return ledger.records.length;
}

function verifyInclusions(ledger, papers) {
  if (ledger.version !== 1 || !Array.isArray(ledger.records)) throw new Error('Invalid confirmed author-inclusion ledger');
  for (const record of ledger.records) {
    const matches = papers.filter(p => p.kind === record.kind && (
      normalize(p.title) === normalize(record.title) ||
      (record.source_url && canonicalUrl(p.url) === canonicalUrl(record.source_url))
    ));
    if (matches.length !== 1) throw new Error('Confirmed paper missing or ambiguous: ' + record.title);
    const authors = plain(matches[0].authors).split(/[,，;；]|\s+and\s+/i).map(normalize);
    for (const required of record.required_authors || []) {
      if (authors.filter(name => name === normalize(required)).length !== 1) {
        throw new Error('User-confirmed author is missing or duplicated: ' + required + ' in ' + record.title);
      }
    }
  }
  return ledger.records.length;
}

function checkVerifiedAuthors(base = root) {
  const ledger = JSON.parse(fs.readFileSync(path.join(base, 'scripts/author-audit/verified-corresponding-authors.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'data/publications.json'), 'utf8'));
  const papers = manifest.yearlyFiles.flatMap(entry => {
    const data = JSON.parse(fs.readFileSync(path.join(base, entry.file), 'utf8'));
    return ['journals', 'conferences'].flatMap(kind => data[kind].flatMap(group => group.items.map(item => ({ ...item, kind }))));
  });
  const count = verifyRecords(ledger, papers);
  const inclusions = path.join(base, 'scripts/author-audit/verified-author-inclusions.json');
  if (fs.existsSync(inclusions)) verifyInclusions(JSON.parse(fs.readFileSync(inclusions, 'utf8')), papers);
  for (const record of ledger.records) {
    for (const evidence of [record.evidence, record.superseded_verification?.evidence]) {
      if (!evidence?.pdf) continue; // Preserve historical PDF integrity even after author supersession.
      const file = path.join(base, evidence.pdf);
      if (fs.existsSync(file)) {
        const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        if (hash !== evidence.sha256) throw new Error('Evidence PDF changed; reverify the author role: ' + record.title);
      }
    }
  }
  return count;
}

if (require.main === module) {
  try { console.log('PASS: ' + checkVerifiedAuthors() + ' evidence-verified author markers; confirmed author inclusions retained; no inferred roles.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { ownerStar, verifyRecords, verifyInclusions, checkVerifiedAuthors };
