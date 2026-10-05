'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {extractPdfTextInfo,extractPdfInfo}=require('../add-paper');
const beginning='Over the past decade, artificial intelligence has developed rapidly across many fields. The scarcity of energy and computational resources presents significant challenges. These challenges provide an unprecedented opportunity for the';
const continuation='introduction of neuromorphic computing chips which can address these challenges. We explore applications in neural interfaces, and improve performance and scalability.';
function parse(body,end='Keywords—neuromorphic computing, circuits',after='I. INTRODUCTION\nThis is the body and must not be included.'){
 return extractPdfTextInfo({text:'Boundary regression test paper\nA. Smith, J. Yang\nAbstract—'+body+'\n'+end+'\n'+after,info:{Title:'Boundary regression test paper'}});
}
test('the word introduction inside an abstract must not terminate extraction',()=>{
 const body=beginning+'\n'+continuation;const result=parse(body);
 assert.equal(result.abstract,(beginning+' '+continuation));assert.deepEqual(result.abstractWarnings,[]);assert.equal(result.abstractMethod,'labeled');
});
test('real standalone Introduction headings terminate extraction',()=>{
 for(const heading of ['I. INTRODUCTION','1. Introduction','INTRODUCTION','1.INTRODUCTION']){
  const body=beginning+' '+continuation;const result=parse(body,heading,'Body text must not enter the abstract.');assert.equal(result.abstract,body);
 }
});
test('keyword headings support merged PDF text and typographic separators',()=>{
 const body=beginning+' '+continuation;
 for(const heading of ['Keywords—chips','Keywords: chips','Index Terms—chips','IndexTerms—chips','Key words: chips','Keywords'])assert.equal(parse(body,heading).abstract,body);
});
test('scientific sentences containing introduction, foundation or keywords remain intact',()=>{
 const body='Foundation models provide a useful basis for neural data analysis.\nOur approach enables the introduction of new architectures.\nKeywords improve retrieval and do not signal the end of this sentence.\nThe benchmark includes university laboratories in China and demonstrates reliable improvements.';
 assert.equal(parse(body).abstract,body.replace(/\s+/g,' '));
});
test('a clearly bounded abstract longer than 3000 characters is not silently cut',()=>{
 const body='This method improves the efficiency of neural signal processing while preserving reliable results. '.repeat(40).trim();
 const result=parse(body);assert(body.length>3000);assert.equal(result.abstract,body);assert.deepEqual(result.abstractWarnings,[]);
});
test('copyright and download footers do not cut a continuing abstract',()=>{
 const result=parse(beginning+'\n©2025 IEEE\nAuthorized licensed use limited to: Example University.\n'+continuation);
 assert.equal(result.abstract,beginning+' '+continuation);
});
test('IEEE footnotes inserted between columns are removed while keeping the continuation',()=>{
 const body=beginning+'\nManuscript received 26 December 2022; revised 7 March 2023.\nThis work was supported by the Foundation.\nA. Smith is with Example University, China.\nDigital Object Identifier 10.1109/example\n'+continuation;
 assert.equal(parse(body).abstract,beginning+' '+continuation);
});
test('missing boundaries and incomplete sentence endings are explicitly flagged',()=>{
 const result=extractPdfTextInfo({text:'Abstract—'+beginning,info:{Title:'Unbounded abstract test'}});
 assert(result.abstractWarnings.some(w=>w.includes('结束')));assert(result.abstractWarnings.some(w=>w.includes('完整句子')));
});
test('a footer Abstract label followed by figure captions must not return figure text',()=>{
 const result=extractPdfTextInfo({text:'Unlabelled paper\nA. Smith\nExample University\nThis paper presents an efficient circuit architecture which reduces energy consumption and demonstrates reliable performance in a realistic evaluation with a complete hardware prototype.\nAbstract\n©2026 IEEE\nFigure 1. This caption is not the abstract and should never appear in it. '+('Circuit label. '.repeat(30)),info:{Title:'Unlabelled paper'}});
 assert(!result.abstract.includes('This caption'));assert(result.abstractWarnings.length>0);
});
const actual=path.join(__dirname,'..','..','papers','2025_ISCAS_Neuromorphic_Computing_Chips_Challenges_and_Trends.pdf');
test('user example: extract through the actual PDF keyword heading',{skip:!fs.existsSync(actual)},async()=>{
 const result=await extractPdfInfo(actual);
 assert.equal(result.title,'Neuromorphic Computing Chips: Challenges and Trends');
 assert(result.abstract.includes('opportunity for the introduction of neuromorphic computing chips'));
 assert(result.abstract.endsWith('performance and scalability.'));assert(!result.abstract.includes('Keywords'));assert(!result.abstract.includes('I. INTRODUCTION'));assert.equal(result.abstract.length,1321);assert.deepEqual(result.abstractWarnings,[]);
});


test('received measurements inside scientific text are not treated as a dated footnote',()=>{
 const body=beginning+'\nreceived 10 packets per sample, demonstrating efficient processing.\nDigital Object Identifier 10.1109/example\n'+continuation;
 const result=parse(body);assert(result.abstract.includes('received 10 packets per sample'));assert(result.abstract.endsWith('performance and scalability.'));
});
