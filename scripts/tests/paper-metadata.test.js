'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveMetadata,inputUrl,identityUrl,doiFrom,parseHtml,publicAddress}=require('../paper-manager/metadata');
const msg={DOI:'10.1234/example',title:['Verified paper'],author:[{given:'Jie',family:'Yang'}],'container-title':['Test Journal'],type:'journal-article',published:{'date-parts':[[2027,1,2]]}};

test('DOI import continues beyond Crossref to fill abstract and records field provenance',async()=>{
  const calls=[];
  const request=async url=>{calls.push(url);if(url.includes('api.crossref.org'))return JSON.stringify({message:msg});if(url.includes('api.openalex.org'))return JSON.stringify({doi:'https://doi.org/10.1234/example',abstract_inverted_index:{Verified:[0],abstract:[1]},locations:[]});return '<html>Access denied</html>';};
  const result=await resolveMetadata('10.1234/example',{request});
  assert.equal(result.title,'Verified paper');assert.equal(result.year,2027);assert.equal(result.section,'journals');
  assert.equal(result.abstract,'Verified abstract');assert.equal(result.fieldSources.abstract,'OpenAlex');
  assert.equal(result.authors,'<strong>J. Yang</strong>');assert(!result.authors.includes('*'));
  assert.equal(result.identified,true);assert.equal(calls.length,3);
});
test('publisher meta tags support content-first attributes, entities and repeated authors',()=>{
  const m=parseHtml(`<meta content="O&#39;Brien &amp; neural circuits" name="citation_title"><meta content="A. Smith" name="citation_author"><meta name='citation_author' content='Jie Yang'><meta content="2026/04/01" name="citation_publication_date"><meta name="citation_journal_title" content="Test Journal"><meta content="/paper.pdf" name="citation_pdf_url">`,'https://example.org/paper');
  assert.equal(m.title,"O'Brien & neural circuits");assert.equal(m.authors,'A. Smith, Jie Yang');assert.equal(m.year,2026);assert.equal(m.pdf,'https://example.org/paper.pdf');
});
test('JSON-LD graph yields scholarly metadata but a generic login page does not',()=>{
  const m=parseHtml('<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':['ScholarlyArticle'],name:'Graph paper',author:{givenName:'Jie',familyName:'Yang'},datePublished:'2026-08-01',abstract:'Full abstract'}]})+'</script>','https://example.org/paper');
  assert.equal(m.title,'Graph paper');assert.equal(m.abstract,'Full abstract');
  assert.deepEqual(parseHtml('<meta property="og:title" content="Login"><meta name="description" content="Subscribe now">','https://example.org/login'),{});
});
test('source failure is explicit and cannot fabricate an identified paper',async()=>{
  const result=await resolveMetadata('https://ieeexplore.ieee.org/document/12345',{ieeeKey:'',request:async()=>{throw Error('HTTP 202');}});
  assert.equal(result.identified,false);assert.equal(result.title,'');assert.equal(result.abstract,'');
  assert(result.warnings.some(w=>w.includes('IEEE_API_KEY')));assert(result.attempts.every(a=>a.status==='failed'));
});
test('IEEE official article-number lookup verifies record identity and does not leak its key',async()=>{
  let used=false;
  const result=await resolveMetadata('https://ieeexplore.ieee.org/abstract/document/12345/',{ieeeKey:'fixture-secret',request:async url=>{
    if(url.includes('ieeexploreapi.ieee.org')){const u=new URL(url);assert.equal(u.searchParams.get('article_number'),'12345');assert.equal(u.searchParams.get('apikey'),'fixture-secret');used=true;return JSON.stringify({articles:[{article_number:12345,title:'IEEE Paper',authors:{authors:[{full_name:'Jie Yang',author_order:2},{full_name:'A. Smith',author_order:1}]},publication_title:'IEEE Test Journal',publication_year:2026,abstract:'Published abstract',content_type:'Journals',access_type:'Open Access',pdf_url:'https://example.org/paper.pdf'}]});}throw Error('unexpected '+url);
  }});
  assert(used);assert.equal(result.authors,'A. Smith, Jie Yang');assert.equal(result.section,'journals');assert.equal(result.abstract,'Published abstract');assert(!JSON.stringify(result).includes('fixture-secret'));
});
test('IEEE credential-bearing request errors are sanitized',async()=>{
  const m=await resolveMetadata('https://ieeexplore.ieee.org/document/12345',{ieeeKey:'fixture-secret',request:async url=>{throw Error('Failed '+url);}});
  assert(!JSON.stringify(m).includes('fixture-secret'));
});
test('DOI mismatch from another source is not merged',async()=>{
  const m=await resolveMetadata('https://doi.org/10.1234/example',{request:async url=>url.includes('api.crossref.org')?JSON.stringify({message:msg}):url.includes('api.openalex.org')?JSON.stringify({doi:'https://doi.org/10.1234/other',abstract_inverted_index:{WRONG:[0]}}):'<meta name="citation_title" content="Wrong paper"><meta name="citation_doi" content="10.1234/other"><meta name="citation_abstract" content="WRONG">'});
  assert.equal(m.title,'Verified paper');assert.equal(m.abstract,'');
});
test('OpenAlex URL fallback requires an exact normalized landing-page match',async()=>{
  const m=await resolveMetadata('https://ieeexplore.ieee.org/document/12345',{ieeeKey:'',request:async url=>url.includes('api.openalex.org')?JSON.stringify({results:[{title:'Wrong paper',locations:[{landing_page_url:'https://ieeexplore.ieee.org/document/54321'}]}]}):'<html></html>'});
  assert.equal(m.identified,false);
});
test('arXiv abstract extraction does not invent its eventual venue or publication type',()=>{
  const m=parseHtml('<meta name="citation_title" content="A preprint"><meta name="citation_author" content="Jie Yang"><blockquote class="abstract mathjax"><span>Abstract:</span> Verified preprint abstract.</blockquote>','https://arxiv.org/abs/2410.12866');
  assert.equal(m.abstract,'Verified preprint abstract.');assert.equal(m.venue,'');assert.equal(m.section,'');
});
test('URL normalization recognizes DOI and IEEE aliases and rejects private targets',()=>{
  assert.equal(inputUrl('doi:10.1234/example'),'https://doi.org/10.1234/example');
  assert.equal(doiFrom('https://www.frontiersin.org/articles/10.3389/fnins.2024.1340164/full'),'10.3389/fnins.2024.1340164');
  assert.equal(identityUrl('https://ieeexplore.ieee.org/abstract/document/12345/'),identityUrl('https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=12345'));
  for(const u of ['http://127.0.0.1','http://2130706433','http://10.0.0.1','http://[::1]','http://[::ffff:127.0.0.1]','http://localhost','file:///tmp/test','https://user:pass@example.org','https://example.org:8002'])assert.throws(()=>inputUrl(u));
  assert.equal(publicAddress('172.16.0.1'),false);assert.equal(publicAddress('192.168.1.1'),false);assert.equal(publicAddress('8.8.8.8'),true);
});
