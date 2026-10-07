'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {ownerStar,verifyRecords,verifyInclusions,checkVerifiedAuthors} = require('../check-corresponding-authors');
const record = {kind:'journals',title:'Known paper',source_url:'https://doi.org/10.1234/one',owner_corresponding:false,evidence:{quote:'Corresponding author: Other Author.',page:1}};
const ledger = () => ({version:1,records:[structuredClone(record)]});
const paper = authors => ({kind:'journals',title:'Known paper',url:'https://doi.org/10.1234/one',authors});

test('bolding the owner is not a corresponding-author declaration',()=>{
  assert.equal(ownerStar('A. Chen, <strong>J. Yang</strong>, M. Sawan*'),false);
  assert.equal(verifyRecords(ledger(),[paper('A. Chen, <strong>J. Yang</strong>, M. Sawan*')]),1);
});
test('rejects reintroduced owner star, including superscript markup',()=>{
  for (const authors of ['A. Chen, <strong>J. Yang*</strong>','A. Chen, J. Yang<sup>*</sup>']) {
    assert.throws(()=>verifyRecords(ledger(),[paper(authors)]),/contradicts/);
  }
});
test('explicit verified positive roles are retained',()=>{
  assert.equal(ownerStar('A. Chen, <strong>J. Yang</strong><sup>*</sup>, M. Sawan'),true);
  const positive=ledger();positive.records[0].owner_corresponding=true;
  assert.equal(verifyRecords(positive,[paper('Jie Yang*, M. Sawan')]),1);
  assert.throws(()=>verifyRecords(positive,[paper('Jie Yang, M. Sawan')]),/contradicts/);
});
test('missing or ambiguous owners fail instead of inventing a role',()=>{
  assert.throws(()=>ownerStar('A. Chen, M. Sawan'),/missing/);
  assert.throws(()=>ownerStar('J. Yang, J. Yang*'),/ambiguous/);
});
test('unverified papers are not silently assigned or stripped of markers',()=>{
  const other={kind:'conferences',title:'Unverified',authors:'J. Yang*',url:'https://example.org/other'};
  assert.equal(verifyRecords(ledger(),[paper('J. Yang'),other]),1);
  assert.equal(other.authors,'J. Yang*');
});
test('historical PDF evidence and latest author-reviewed roles agree with website data',()=>{
  assert.equal(checkVerifiedAuthors(),11);
});

test('user-confirmed K. Cheng is retained without inferring a role',()=>{
  const inclusion={version:1,records:[{kind:'journals',title:'Known paper',required_authors:['K. Cheng']}]};
  const authors='J. Yang*, C-Y. Tsui, K. Cheng';
  assert.equal(verifyInclusions(inclusion,[paper(authors)]),1);
  assert.throws(()=>verifyInclusions(inclusion,[paper('J. Yang*, C-Y. Tsui')]),/missing or duplicated/);
  assert.throws(()=>verifyInclusions(inclusion,[paper(authors+', K. Cheng')]),/missing or duplicated/);
  assert.throws(()=>verifyInclusions(inclusion,[paper('J. Yang*, K-T. Cheng')]),/missing or duplicated/);
});

test('direct author confirmation is distinct from publisher PDF evidence',()=>{
  const confirmed={version:1,records:[{...record,owner_corresponding:true,evidence:{kind:'author_confirmation',statement:'这几个论文，我都是通讯作者',confirmed_on:'2026-10-07'}}]};
  assert.equal(verifyRecords(confirmed,[paper('<strong>J. Yang*</strong>')]),1);
  confirmed.records[0].evidence.statement='unverified';
  assert.throws(()=>verifyRecords(confirmed,[paper('J. Yang*')]),/Explicit PDF or author-confirmation evidence/);
});
