'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {classifyPdfLink,rankPdfLinks,publicWebUrl,samePaperLink}=require('../chrome-paper-helper/pdf-policy.mjs');
test('recognizes common OA and publisher PDF routes without an IEEE-only gate',()=>{
 for(const url of [
  'https://arxiv.org/pdf/2411.16806',
  'https://www.mdpi.com/1424-8220/23/21/8882/pdf',
  'https://www.frontiersin.org/articles/10.3389/fnins.2024.1340164/pdf',
  'https://www.nature.com/articles/s41598-021-02798-8.pdf',
  'https://link.springer.com/content/pdf/10.1007/example.pdf',
  'https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/example',
  'https://www.sciencedirect.com/science/article/pii/S0950705126005563/pdfft?download=true',
  'https://openreview.net/pdf?id=cKAUvMePUN',
 ])assert.equal(classifyPdfLink(url)?.direct,true,url);
 assert.equal(classifyPdfLink('https://onlinelibrary.wiley.com/doi/epdf/10.1002/example')?.direct,false);
});
test('metadata or labelled download links can be opaque URLs but unrelated page links are ignored',()=>{
 const url='https://publisher.example.org/download?article=123';assert.equal(classifyPdfLink(url),null);assert.equal(classifyPdfLink({url,kind:'citation-meta'})?.direct,true);assert.equal(classifyPdfLink({url,kind:'pdf-link',label:'Download PDF'})?.direct,true);
 assert.equal(classifyPdfLink({url:'https://publisher.example.org/supplementary.pdf',kind:'pdf-link',label:'Supplementary material'}),null);
});
test('related-paper links with conflicting identifiers are rejected',()=>{
 assert(!samePaperLink('https://arxiv.org/pdf/2411.16807',{pageUrl:'https://arxiv.org/abs/2411.16806'}));
 assert(!samePaperLink('https://openreview.net/pdf?id=other',{pageUrl:'https://openreview.net/forum?id=correct'}));
 assert(!samePaperLink('https://www.mdpi.com/1424-8220/23/21/9999/pdf',{pageUrl:'https://www.mdpi.com/1424-8220/23/21/8882'}));
 assert(!samePaperLink('https://www.frontiersin.org/articles/10.3389/fnins.2024.9999999/pdf',{expectedDoi:'10.3389/fnins.2024.1340164'}));
 assert(!samePaperLink('https://www.sciencedirect.com/science/article/pii/S999/pdfft',{pageUrl:'https://www.sciencedirect.com/science/article/pii/S123'}));
 assert(!samePaperLink('https://www.nature.com/articles/other.pdf',{pageUrl:'https://www.nature.com/articles/correct'}));
});
test('private addresses, credential-bearing URLs, Scholar and unsupported protocols remain blocked',()=>{
 for(const url of ['http://127.0.0.1/private.pdf','https://192.168.1.1/private.pdf','https://2130706433/private.pdf','https://[::1]/private.pdf','http://localhost/file.pdf','https://host.internal/paper.pdf','https://example.org:8002/a.pdf','https://user:secret@example.org/a.pdf','file:///c:/secret.pdf','https://scholar.google.com/citations?user=test'])assert.throws(()=>publicWebUrl(url),url);
});
test('metadata PDF links rank above generic anchors and attempts cannot loop',()=>{
 const urls=[{url:'https://example.org/other.pdf',kind:'pdf-link'},{url:'https://example.org/main.pdf',kind:'citation-meta'}];
 assert.equal(rankPdfLinks(urls)[0].url,'https://example.org/main.pdf');assert.equal(rankPdfLinks(urls,{},[],['https://example.org/main.pdf']).length,1);
});
