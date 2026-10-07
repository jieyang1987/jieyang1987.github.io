/* Static reading notes remain readable and linkable without JavaScript. */
'use strict';
(() => {
 const cards = [...document.querySelectorAll('.insight-card')];
 if (!cards.length) return;
 const search = document.getElementById('insight-search');
 const topic = document.getElementById('insight-topic');
 const count = document.getElementById('insight-count');
 const empty = document.getElementById('insight-no-results');
 document.querySelector('.insight-controls').hidden = false;
 function filter() {
  const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const card of cards) {
   const text = (card.querySelector?.('.chip-content') || card).textContent.toLocaleLowerCase();
   card.hidden = !terms.every(term => text.includes(term)) || !!(topic.value && !card.dataset.topics.split(' ').includes(topic.value));
   if (!card.hidden) visible++;
  }
  count.textContent = `${visible} ${count.dataset.unit}`;
  empty.hidden = visible !== 0;
 }
 function reset() { search.value = ''; topic.value = ''; filter(); }
 function revealHash() {
  const card = cards.find(item => '#'+item.id === location.hash);
  if (card) { reset(); card.scrollIntoView({block:'start'}); }
 }
 search.addEventListener('input',filter);
 topic.addEventListener('change',filter);
 document.getElementById('insight-reset').addEventListener('click', () => { reset(); search.focus(); });
 window.addEventListener('hashchange',revealHash);
 revealHash();
})();
