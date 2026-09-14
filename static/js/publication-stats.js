/* Optional venue summary. Uses the shared paper records and preserves existing matching rules. */
(function () {
 'use strict';
 const journalMapping = {
      'IEEE Journal of Solid-State Circuits': 'JSSC',
      'IEEE Journal of Biomedical and Health Informatics': 'JBHI',
      'IEEE Transactions on Biomedical Circuits and Systems': 'TBioCAS',
      'Journal of Neural Engineering': 'JNE',
      'IEEE Transactions on Biomedical Engineering': 'TBME',
      'IEEE Transactions on Neural Systems and Rehabilitation Engineering': 'TNSRE',
      'IEEE Transactions on Circuits and Systems II': 'TCAS-II',
      'IEEE Transactions on Circuits and Systems for Video Technology': 'TCSVT',
      'IEEE Transactions on Circuits and Systems for Artificial Intelligence': 'TCASAI',
      'IEEE Transactions on Circuits and Systems I: Regular Papers': 'TCAS-I',
    };
 const conferenceMapping = {
      'ISSCC':  ['IEEE International Solid-State Circuits Conference'],
      'CICC':   ['Custom Integrated Circuits Conference', 'CICC'],
      'ICLR':   ['International Conference on Learning Representations', 'ICLR'],
      'ECCV':   ['European Conference on Computer Vision', 'ECCV'],
      'DATE':   ['Design, Automation & Test in Europe', 'DATE'],
      'ESSERC': ['European Solid State Circuits Conference', 'ESSCIRC', 'European Solid-State Electronics Research Conference', 'ESSERC'],
      'A-SSCC': ['Asian Solid-State Circuits Conference', 'A-SSCC'],
      'BioCAS': ['Biomedical Circuits and Systems Conference', 'BioCAS'],
      'ISCAS':  ['International Symposium on Circuits and Systems', 'ISCAS'],
      'AICAS':  ['Artificial Intelligence Circuits and Systems', 'AICAS']
    };
 const plain = value => { const el=document.createElement('template'); el.innerHTML=String(value||''); return el.content.textContent||''; };
 window.renderVenueStats = function(papers, container, language = 'zh') {
   const english = language === 'en';
   const journals={}, conferences={};
   for(const p of papers) {
     const copy=plain([p.authors,p.title,p.venue,p.award].join(' '));
     if(p.type==='journals') { for(const [name,label] of Object.entries(journalMapping)) { if(copy.includes(name)){journals[label]=(journals[label]||0)+1; break;} } }
     else { for(const [label,names] of Object.entries(conferenceMapping)) { if(names.some(name=>copy.includes(name))){conferences[label]=(conferences[label]||0)+1; break;} } }
   }
   const maxCount=Math.max(1,...Object.values(journals),...Object.values(conferences));
   const group=(title,counts,order)=>{
     const names=order.filter(name=>counts[name]);
     if(!names.length) return '';
     return '<section class="pub-venue-chart" aria-label="'+title+(english ? ' publication counts' : '发表数量')+'"><h3>'+title+'</h3><ul>'+names.map(name=>{
       const count=counts[name],width=(100*count/maxCount).toFixed(2);
       return '<li class="pub-venue-row" data-venue="'+name+'" data-count="'+count+'"><span class="pub-venue-name">'+name+'</span><span class="pub-venue-track" aria-hidden="true"><span style="width:'+width+'%"></span></span><span class="pub-venue-count">'+count+'</span></li>';
     }).join('')+'</ul></section>';
   };
   container.className='pub-stats'; container.setAttribute('role','group');container.setAttribute('aria-label',english ? 'Cumulative counts for selected journals and conferences' : '部分期刊与会议的累计发表统计');
   const groups=group(english ? 'Journals' : '期刊',journals,Object.values(journalMapping))+group(english ? 'Conferences' : '会议',conferences,Object.keys(conferenceMapping));
   container.innerHTML=groups?'<div class="pub-venue-charts" data-max-count="'+maxCount+'">'+groups+'</div>':'';
   return Boolean(groups);
 };
})();
