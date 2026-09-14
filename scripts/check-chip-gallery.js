/* Focused tests of the deployed chip renderer; no browser or network required.
 * Presentation helpers are stubbed: these tests cover card structure/data and filters,
 * not the shared HTML sanitizer or a browser's native <details> implementation. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/chips.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'static/js/en-site.js'), 'utf8');
const start = source.indexOf('  async function chips() {');
const end = source.indexOf('  async function publications()', start);
assert(start >= 0 && end > start, 'Find the actual deployed chip renderer');
const renderer = source.slice(start, end).trim();
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let checks = 0;
function check(condition, message) { assert(condition, message); checks++; }
async function render(lang, records = data) {
  const nodes = {'chip-count': {textContent: ''}, 'chip-grid': {innerHTML: ''}};
  const buttons = records.filters.map(filter => ({
    dataset: {category: filter.id}, attributes: {},
    addEventListener(event, listener) { this[event] = listener; },
    setAttribute(name, value) { this.attributes[name] = value; }
  }));
  const content = {innerHTML: '', querySelectorAll: () => buttons};
  const context = {
    lang, content, document: {getElementById: id => nodes[id]},
    json: async file => { assert.equal(file, 'data/chips.json'); return records; },
    t: (en, zh) => lang === 'zh' ? zh : en,
    esc: escape, rich: value => String(value),
    chipImage: value => value.replace(/\.(jpg|jpeg|png)$/i, '.webp'),
    imageButton: (src, title) => '<button data-image="'+escape(src)+'">'+escape(title)+'</button>',
    external: (url, label) => '<a href="'+escape(url)+'">'+label+'</a>'
  };
  await vm.runInNewContext('('+renderer+')', context)();
  return {nodes, buttons};
}
const cards = html => [...html.matchAll(/<article class="en-chip-card en-surface">([\s\S]*?)<\/article>/g)].map(match => match[1]);
async function main() {
  for (const lang of ['zh', 'en']) {
    const state = await render(lang);
    const markup = state.nodes['chip-grid'].innerHTML;
    const rendered = cards(markup);
    check(rendered.length === data.chips.length, lang+': all chips remain visible');
    check(!/<details\b[^>]*\bopen(?:\s|=|>)/.test(markup), lang+': no initially open disclosures');
    data.chips.forEach((chip, index) => {
      const card = rendered[index];
      const features = chip.features[lang] || [];
      check(card.includes('<h2>'+escape(chip.title[lang])+'</h2>'), lang+': chip title retained');
      check(card.includes('data-image='), lang+': enlarge-image control retained');
      const details = card.match(/<details class="en-chip-details">([\s\S]*?)<\/details>/)?.[1];
      if (lang === 'zh' && features.length) {
        check(!!details, 'Chinese parameters are inside a disclosure');
        check(/<summary\b[^>]*>芯片特点<\/summary>/.test(details), 'Disclosure has the requested visible label');
        check(details.includes('aria-label="'+escape(chip.title.zh)+'：芯片特点"'), 'Disclosure has a chip-specific accessible name');
        for (const feature of features) check(details.includes('<li>'+feature+'</li>'), 'Every Chinese parameter retained inside disclosure');
        check(!card.replace(/<details[\s\S]*?<\/details>/, '').includes('<ul>'), 'No duplicate expanded parameter list');
      } else {
        check(!details, lang+': no unwanted disclosure');
        for (const feature of features) check(card.includes('<li>'+feature+'</li>'), 'English parameter remains directly available');
      }
      for (const paper of chip.papers || []) check(card.includes('href="'+escape(paper.url)+'"'), lang+': paper URL retained');
    });
    for (const button of state.buttons) {
      button.click();
      const category = button.dataset.category;
      const expected = data.chips.filter(chip => category === 'all' || (Array.isArray(chip.category) ? chip.category.includes(category) : chip.category === category));
      check(cards(state.nodes['chip-grid'].innerHTML).length === expected.length, lang+': category filter still works: '+category);
      check(button.attributes['aria-pressed'] === 'true', lang+': active category is announced');
      check(!/<details\b[^>]*\bopen(?:\s|=|>)/.test(state.nodes['chip-grid'].innerHTML), 'Filtered cards start collapsed');
    }
  }
  const noFeatures = structuredClone(data);
  noFeatures.chips = [{...noFeatures.chips[0], features: {zh: [], en: []}}];
  check(!(await render('zh', noFeatures)).nodes['chip-grid'].innerHTML.includes('<details'), 'No empty disclosure for chips without parameters');
  const empty = {...data, chips: []};
  check((await render('zh', empty)).nodes['chip-grid'].innerHTML === '', 'An empty gallery renders without errors');
  console.log('PASS: '+checks+' chip renderer checks; Chinese collapsed details, English lists, all filters and empty states.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
