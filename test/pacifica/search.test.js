'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const search=require('../../public/archive-search');
const rows=[
 {id:'a1',sho:'a',title:'Music Hour',host:'José',cat:'music',dt:20,published:[],episodeDesc:''},
 {id:'a2',sho:'a',title:'Music Hour',host:'José',cat:'music',dt:10,published:[{topic:'Housing in Los Angeles',guest:'Maria',notes:'Tenants and rent'}],episodeDesc:'Housing in Los Angeles'},
 {id:'b1',sho:'b',title:'Jazz',host:'Ann',cat:'arts',dt:30,published:[],episodeDesc:''}
];
const index=search.build(rows,{a:{name:'Music Hour',desc:'Jazz and improvisation every week'}},{music:'Music',arts:'Arts & Culture'});
test('description matches a show, not every episode; exact show name leads',()=>{
 const result=search.find(index,'jazz','all');assert.deepEqual(result.shows.map(s=>s.show.id),['b','a']);assert.deepEqual(result.episodes.map(e=>e.row.id),['b1']);assert.equal(result.shows[1].reason,'Show description');assert.equal(result.shows[1].show.count,2);
});
test('topics and guests find individual episodes, without inventing show matches',()=>{
 assert.deepEqual(search.find(index,'housing','all').episodes.map(e=>e.row.id),['a2']);assert.equal(search.find(index,'housing','all').shows.length,0);assert.equal(search.find(index,'maria','all').episodes[0].row.id,'a2');
});
test('accents and punctuation normalize; category filters both result types',()=>{
 assert.equal(search.find(index,'JOSE!','all').episodes.length,2);assert.equal(search.find(index,'jazz','music').shows.length,1);assert.equal(search.find(index,'jazz','music').episodes.length,0);assert.deepEqual(search.find(index,'!!!','all'),{shows:[],episodes:[]});
});
test('newest episode is chosen independently of input order and refresh replaces index',()=>{
 const rebuilt=search.build(rows.slice().reverse(),{},{});assert.equal(rebuilt.shows.find(s=>s.id==='a').latest.id,'a1');assert.equal(search.find(search.build([rows[0]],{},{}),'housing','all').episodes.length,0);
});

// Class: a pasted description in the topic field must never become a heading
// (Rising Up / This Way Out paste 440-942 character paragraphs there).
test('over-long topics are demoted to the preview; real titles stay titles',()=>{
 const para='This week, well begin by digging under the headlines of how the Trump Administration has refused to renew funding for legal representation for unaccompanied immigrant children. '.repeat(3);
 const long={title:'Rising Up',published:[{topic:para}],episodeDesc:''};
 assert.equal(search.episodeTitle(long),'','paragraph is not a title');
 assert.equal(search.episodeBlurb(long),para.trim(),'its text is kept as the preview');
 assert.equal(search.episodeBlurb({...long,episodeDesc:'Notes'}),'Notes','episode notes win when present');
 assert.equal(search.episodeTitle({published:[{topic:'The Last Train From Hiroshima'}]}),'The Last Train From Hiroshima');
 const edge='x'.repeat(search.TITLE_MAX);
 assert.equal(search.episodeTitle({published:[{topic:edge}]}),edge,'exactly at the limit is still a title');
 assert.equal(search.episodeTitle({published:[{topic:edge+'x'}]}),'','one over is a description');
 assert.equal(search.episodeTitle({published:[{topic:'  '},{topic:'Second topic'}]}),'Second topic','blank topics are skipped');
 assert.equal(search.episodeTitle({}),'');
});

// Class: result text is highlighted safely and previews expand only when cut.
test('highlight marks query words accent- and case-insensitively, and never injects markup',()=>{
 assert.equal(search.highlight('Música & <b>Trump</b>','musica trump'),'<mark class="search-hit">Música</mark> &amp; &lt;b&gt;<mark class="search-hit">Trump</mark>&lt;/b&gt;');
 assert.equal(search.highlight('a b c','a'),'a b c','one-letter words are not highlighted');
 assert.equal(search.highlight('No match here','zzz'),'No match here');
 assert.equal(search.highlight('x"y','"'),'x&quot;y');
});
test('expandable previews carry the full text only when the preview was cut',()=>{
 assert.equal(search.expandable('Short note about Trump','trump',180),'Short note about <mark class="search-hit">Trump</mark>');
 const long='word '.repeat(100)+'Trump appears late. '+'tail '.repeat(100);
 const html=search.expandable(long,'trump',120);
 assert.match(html,/^<span class="search-short">…/,'preview starts near the match');
 assert.match(html,/<span class="search-full" hidden>/);assert.match(html,/<button type="button" class="search-expand" aria-expanded="false">Show more<\/button>$/);
 assert.ok(html.split('search-hit').length===3,'the term is marked in both the preview and the full text');
});

// Class: results ranked by how well they match, not by date (2026-10-27, Ace's review: searching
// "food", Thom Hartmann's passing "food stamps" sat level with Radio Maiz's food-justice
// episodes, and "food" found 2 shows while episodes came from about a dozen). The passing
// mentions here are the NEWEST rows, so date order alone would put them first.
const ace=[
 {id:'m1',sho:'maiz',title:'Radio Maiz',host:'',cat:'espanol',dt:100,published:[{topic:'Food justice and maize',notes:''}],episodeDesc:'Food sovereignty, food systems and community food gardens.'},
 {id:'m2',sho:'maiz',title:'Radio Maiz',host:'',cat:'espanol',dt:90,published:[{topic:'Traditional food systems',notes:''}],episodeDesc:'How food travels from field to table.'},
 {id:'m3',sho:'maiz',title:'Radio Maiz',host:'',cat:'espanol',dt:80,published:[{topic:'Corn and culture',notes:''}],episodeDesc:'Seeds and food heritage.'},
 {id:'h1',sho:'hart',title:'Thom Hartmann Program',host:'Thom Hartmann',cat:'news',dt:300,published:[{topic:'Election news and the economy',notes:''}],episodeDesc:'Callers on taxes, wages and food stamps.'},
 {id:'s1',sho:'sea',title:'Ocean Talk',host:'',cat:'news',dt:400,published:[{topic:'Seafood prices',notes:''}],episodeDesc:''},
 {id:'f1',sho:'foodshow',title:'Food Matters',host:'',cat:'news',dt:50,published:[{topic:'Interview',notes:''}],episodeDesc:''},
];
const aceIndex=search.build(ace,{maiz:{name:'Radio Maiz',desc:'Indigenous voices'},hart:{name:'Thom Hartmann Program'},sea:{name:'Ocean Talk'},foodshow:{name:'Food Matters'}},{});
test('an episode about the subject outranks a newer passing mention; a word inside another word ranks last',()=>{
 const ids=search.find(aceIndex,'food','all').episodes.map(e=>e.row.id);
 assert.ok(ids.indexOf('m1')<ids.indexOf('h1') && ids.indexOf('m2')<ids.indexOf('h1'),'food-justice episodes before "food stamps": '+ids);
 assert.equal(ids.at(-1),'s1','"seafood" is the weakest match');
});
test('a show with several matching episodes is a show result; a show named for the words still leads',()=>{
 const shows=search.find(aceIndex,'food','all').shows;
 assert.equal(shows[0].show.id,'foodshow','show-name match first');
 const maiz=shows.find(s=>s.show.id==='maiz');
 assert.ok(maiz,'Radio Maiz is found through its episodes'); assert.equal(maiz.reason,'3 episodes'); assert.equal(maiz.matches,3);
 assert.ok(!shows.some(s=>s.show.id==='hart'),'one passing mention does not make a show result');
});
test('episode groups: the show with many good matches leads one with a single mention',()=>{
 const g=search.groups(search.find(aceIndex,'food','all').episodes);
 assert.equal(g[0].sho,'maiz'); assert.deepEqual(g[0].hits.map(h=>h.row.id),['m1','m2','m3']);
 assert.ok(g.findIndex(x=>x.sho==='hart')>0);
});

// Class: a result shows why it matched (Paul, 2026-10-27: searching "nader" listed Global Village,
// whose notes name a musician "Salar Nader", and Something's Happening hours whose cards showed a
// description without the word). A name only in notes never makes a show result; a show found
// through its episodes carries the headline that matched, for the card to show.
test('a name only in episode notes does not make a show result; a show result carries its matching headline',()=>{
 const r=[
  {id:'g1',sho:'gv',title:'Global Village',host:'',cat:'music',dt:10,published:[{topic:'Music from around the world'}],episodeDesc:'Benefit concert with Salar Nader and friends.'},
  {id:'g2',sho:'gv',title:'Global Village',host:'',cat:'music',dt:20,published:[{topic:'Fusion celebration'}],episodeDesc:'Line-up: Rudy Sarzo, Salar Nader.'},
  {id:'s1',sho:'sh',title:"Something's Happening A hour 2",host:'',cat:'news',dt:30,published:[{topic:'Ralph Nader on smart voting'}],episodeDesc:''},
  {id:'s2',sho:'sh',title:"Something's Happening A hour 2",host:'',cat:'news',dt:40,published:[{topic:'Foreign policy'}],episodeDesc:'Ralph Nader discusses Iran.'},
 ];
 const idx=search.build(r,{gv:{name:'Global Village',desc:'Eclectic global sounds'},sh:{name:"Something's Happening A hour 2",desc:'Tue - Behind the News'}},{});
 const shows=search.find(idx,'nader','all').shows;
 assert.ok(!shows.some(s=>s.show.id==='gv'),'notes-only mentions do not promote Global Village');
 const sh=shows.find(s=>s.show.id==='sh');
 assert.ok(sh,'two matching episodes, one by headline'); assert.equal(sh.example.id,'s1','the card shows the matching headline');
 assert.match(search.episodeTitle(sh.example),/Nader/);
});
