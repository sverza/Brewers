/* Presentation only: all totals, averages, coverage and rankings come from the static export. */
(function(global){
  'use strict';
  const A=global.BrewersSportsSite,S=global.BrewersSafe,h=S.escape;
  const cats=[['pts','Punti'],['ast','Assist'],['reb','Rimbalzi'],['stl','Palle rubate'],['ftm','Liberi segnati'],['tpm','Triple segnate']];
  const fields=[['min','MIN'],['pts','PTS'],['reb','REB'],['ast','AST'],['stl','STL'],['blk','BLK'],['to','PERSE'],['foul','FALLI']];
  const byId=id=>document.getElementById(id),date=iso=>new Date(iso+'T12:00:00').toLocaleDateString('it-IT');
  function notice(data,message){
    let n=byId('bh-source');if(!n){n=document.createElement('div');n.id='bh-source';n.className='bh-source';n.setAttribute('role','status');(byId('header-container')||document.body.firstChild).after(n);}
    n.textContent=message||(A.preview?(A.previewLabel||'Anteprima locale · Dati sportivi QA dimostrativi, non risultati ufficiali'):'Dati sportivi · Brewers Hub');
    if(data){n.dataset.release=data.current.releaseId;document.body.dataset.sportsState='ready';}
  }
  async function run(targets,fn){try{const data=await A.load();notice(data);await fn(data);}catch(_){notice(null,'Dati sportivi temporaneamente non disponibili.');document.body.dataset.sportsState='error';for(const id of targets){const e=byId(id);if(e)e.innerHTML=id==='top25Body'?'<tr><td colspan="6" class="table-empty">Classifica non disponibile.</td></tr>':'<div class="bh-empty">Dati sportivi non disponibili.</div>';}}}
  function select(host,data,season,onchange,{all=true}={}){
    let wrap=byId('bh-season-wrap');if(!wrap){wrap=document.createElement('div');wrap.id='bh-season-wrap';wrap.className='bh-controls';host.prepend(wrap);}
    wrap.replaceChildren();const label=document.createElement('label');label.textContent='Stagione ';const menu=document.createElement('select');menu.id='sports-season';menu.setAttribute('aria-label','Stagione sportiva');
    for(const value of [...data.current.allowedSeasonIds.slice().reverse(),...(all?['all']:[])]){const o=document.createElement('option');o.value=value;o.textContent=A.label(value);o.selected=value===season;menu.append(o);}
    if(!season){const o=document.createElement('option');o.textContent='Stagione non disponibile';o.value='';o.selected=true;menu.append(o);}
    menu.addEventListener('change',()=>{const u=new URL(location.href);u.searchParams.set('stagione',menu.value);history.replaceState(null,'',u);onchange(menu.value);});label.append(menu);wrap.append(label);
  }
  const currentNumber=p=>p?.currentJerseyNumber??p?.jerseyNumber??null;
  const profileLink=(data,id,season,number=undefined)=>{const p=data.players.get(id),n=number===undefined?currentNumber(p):number;return p?`<a href="${h(A.playerHref(p,season))}">${h(p.displayName)}${n!=null?` <span class="bh-jersey">#${h(A.fmt(n))}</span>`:''}</a>`:'—';};
  function cell(metric,mode){if(!metric||metric.validGames===0)return '—';const text=A.fmt(mode==='avg'?metric.average:metric.total);return `<span${metric.complete?'':` class="bh-partial" title="${metric.validGames} gare con dati; ${metric.missingGames} senza dati"`}>${h(text)}${metric.complete?'':'*'}</span>`;}
  function statsTable(data,rows,mode,season,team=false){
    const columns=[...(team?[]:[['player','Giocatore'],['games','Gare']]),...fields,['fgPct','FG%'],['tpPct','3PT%'],['ftPct','FT%']];
    const wrap=document.createElement('div');wrap.className='bh-table-wrap';wrap.tabIndex=0;wrap.setAttribute('aria-label',team?'Statistiche Brewers':'Tabella statistiche individuali; scorrimento orizzontale');
    const table=document.createElement('table');table.className='bh-table';wrap.append(table);let sort='pts',direction=-1;
    const value=(row,key)=>key==='games'?row.gamesPlayed:key==='player'?data.players.get(row.playerId)?.displayName||'':key.endsWith('Pct')?row.shooting[key]:row.metrics[key]?.[mode==='avg'?'average':'total'];
    function draw(){
      const sorted=[...rows].sort((a,b)=>{const x=value(a,sort),y=value(b,sort);if(x==null)return y==null?0:1;if(y==null)return -1;return direction*(typeof x==='string'?x.localeCompare(y,'it'):x-y);});
      table.innerHTML=`<thead><tr>${columns.map(([key,title])=>`<th scope="col" aria-sort="${sort===key?(direction===1?'ascending':'descending'):'none'}"><button type="button" data-sort="${key}">${title}${sort===key?(direction===1?' ↑':' ↓'):''}</button></th>`).join('')}</tr></thead><tbody>${sorted.map(row=>`<tr>${columns.map(([key])=>`<td>${key==='player'?profileLink(data,row.playerId,season):key==='games'?row.gamesPlayed:key.endsWith('Pct')?(row.shooting[key]===null?'—':h(A.fmt(row.shooting[key]))+'%'):cell(row.metrics[key],mode)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${columns.length}">Nessuna statistica disponibile per questa stagione.</td></tr>`}</tbody>`;
      table.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.sort;direction=sort===key?-direction:key==='player'?1:-1;sort=key;draw();}));
    }draw();return wrap;
  }
  const detailColumns=[['min','MIN'],['pts','PTS'],['twoPair','2P R/T'],['twoPct','2P%'],['threePair','3P R/T'],['threePct','3P%'],['ftPair','TL R/T'],['ftPct','TL%'],['reb','REB'],['oreb','RO'],['dreb','RD'],['ast','AST'],['stl','REC'],['to','PER'],['blk','STO'],['foul','FAL'],['fgPair','TC R/T'],['fgPct','TC%']];
  const shots={twoPair:['twoMade','twoAttempted'],twoPct:['twoMade','twoAttempted'],threePair:['tpm','tpa'],threePct:['tpm','tpa'],ftPair:['ftm','fta'],ftPct:['ftm','fta'],fgPair:['fgm','fga'],fgPct:['fgm','fga']};
  function detailTable(data,rows,season,{box=false,mode='total',names=true}={}){
    const wrap=document.createElement('div');wrap.className='bh-table-wrap'+(box?' bh-box-score':'');wrap.tabIndex=0;wrap.setAttribute('aria-label','Tabellino dettagliato Brewers; scorrimento orizzontale');const table=document.createElement('table');table.className='bh-table';wrap.append(table);let key='pts',direction=-1;
    const raw=(r,k)=>box?r.stats[k]:r.metrics[k]?.[mode==='avg'?'average':'total'];
    const percent=(r,k)=>{const [made,attempt]=shots[k];if(!box&&(!r.metrics[made]?.complete||!r.metrics[attempt]?.complete))return null;const m=box?r.stats[made]:r.metrics[made]?.total,a=box?r.stats[attempt]:r.metrics[attempt]?.total;return m==null||a==null||a===0?null:100*m/a;};
    const value=(r,k)=>k==='name'?data.players.get(r.playerId)?.displayName||'':k==='games'?r.gamesPlayed:k.endsWith('Pct')?percent(r,k):raw(r,shots[k]?.[0]||k);
    function content(r,k){if(k==='name')return profileLink(data,r.playerId,season,box?(r.jerseyNumber??data.players.get(r.playerId)?.jerseyNumber??null):undefined);if(k==='games')return h(A.fmt(r.gamesPlayed));if(k.endsWith('Pct')){const v=percent(r,k);return v==null?'—':h(A.fmt(v))+'%';}if(shots[k])return shots[k].map(f=>box?h(A.fmt(raw(r,f))):cell(r.metrics[f],mode)).join(' / ');return box?h(A.fmt(raw(r,k))):cell(r.metrics[k],mode);}
    function draw(){const cols=[...(names?[['name','Giocatore']]:[]),...(!box&&names?[['games','Gare']]:[]),...detailColumns],sorted=[...rows].sort((a,b)=>{const x=value(a,key),y=value(b,key);return x==null?(y==null?0:1):y==null?-1:direction*(typeof x==='string'?x.localeCompare(y,'it'):x-y);});table.innerHTML=`<thead><tr>${cols.map(([k,label])=>`<th scope="col" aria-sort="${key===k?(direction===1?'ascending':'descending'):'none'}"><button type="button" data-detail-sort="${k}">${label}${key===k?(direction===1?' ↑':' ↓'):''}</button></th>`).join('')}</tr></thead><tbody>${sorted.map(r=>`<tr>${cols.map(([k])=>`<td>${content(r,k)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}">Nessuna statistica disponibile.</td></tr>`}</tbody>`;table.querySelectorAll('[data-detail-sort]').forEach(b=>b.addEventListener('click',()=>{direction=key===b.dataset.detailSort?-direction:b.dataset.detailSort==='name'?1:-1;key=b.dataset.detailSort;draw();}));}draw();return wrap;
  }
  function periodTable(g,box){const section=document.createElement('section');section.className='bh-periods';section.innerHTML='<h2>Parziali per periodo</h2>';if(!box?.periodScores){const p=document.createElement('p');p.className='bh-note';p.textContent='Parziali non disponibili per questa partita.';section.append(p);return section;}const wrap=document.createElement('div');wrap.className='bh-table-wrap';wrap.tabIndex=0;wrap.setAttribute('aria-label','Punteggi per quarto e supplementari');wrap.innerHTML=`<table class="bh-table"><thead><tr><th>Squadra</th>${box.periodScores.map(r=>`<th>${r.period<=4?'Q'+r.period:'OT'+(r.period-4)}</th>`).join('')}<th>Totale</th></tr></thead><tbody>${[['BREWERS','brewers'],[g.opponent,'opponent']].map(([name,k])=>`<tr><th scope="row">${h(name)}</th>${box.periodScores.map(r=>`<td>${h(A.fmt(r[k]))}</td>`).join('')}<td>${h(A.fmt(g.result?.[k]))}</td></tr>`).join('')}</tbody></table>`;section.append(wrap);return section;}
  function coverage(record){return record.complete?'Copertura completa':`Dati parziali · ${record.knownPerformances} prestazioni note, ${record.missingPerformances} non rilevate, ${record.gamesWithoutBoxScore} gare senza referto`;}
  async function stats(){return run(['leaders-grid','record-performances'],data=>{
    let season=A.seasonFrom(data),mode='total';byId('season-filter').replaceChildren();select(byId('season-filter'),data,season,s=>{season=s;render();});
    const section=document.createElement('section');section.className='stats-section bh-summaries';section.id='bh-summaries';byId('leaders').after(section);
    byId('mode-toggle').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;byId('mode-toggle').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render();}));
    function render(){
      const summary=season?data.summary(season):null,records=season?data.records(season):null;
      byId('leaders').querySelector('h2').textContent='LEADERS · '+(season?A.label(season):'Stagione non disponibile');
      byId('leaders').setAttribute('aria-label','Classifiche · '+(season?A.label(season):'Stagione non disponibile'));
      byId('prestazioni').querySelector('.stats-section-sub').textContent=season?A.label(season):'Stagione non disponibile';
      byId('mode-toggle-note').textContent=mode==='avg'?'Classifiche medie: almeno 3 presenze e metrica completa.':'Classifiche: soltanto metriche complete; i dati parziali restano consultabili nelle tabelle.';
      byId('leaders-grid').innerHTML=summary?['pts','reb','ast','stl','blk','games'].map(key=>{
        const rows=(key==='games'?summary.leaderboards.games:summary.leaderboards[key][mode==='avg'?'averages':'totals']).slice(0,5);
        const label=key==='games'?'Presenze':fields.find(f=>f[0]===key)?.[1]||key;
        return `<article class="leader-card"><div class="leader-card-header"><span class="leader-card-title">${label}</span><span class="leader-unit">${key==='games'||mode==='total'?'TOT':'MEDIA'}</span></div><div class="leader-list">${rows.map((r,i)=>`<div class="leader-row rank-${i+1}"><span class="leader-rank">${i+1}</span><span class="leader-name">${profileLink(data,r.playerId,season)}</span><span class="leader-value">${h(A.fmt(r.value))}</span></div>`).join('')||'<div class="leader-empty">Nessun dato idoneo disponibile.</div>'}</div></article>`;
      }).join(''):'<div class="grid-empty">Stagione non disponibile.</div>';
      byId('record-performances').innerHTML=cats.map(([key,label])=>{const rec=records?.[key],first=rec?.holders[0],game=first&&data.games.get(first.gameId),holders=rec?.holders.filter((p,i,rows)=>rows.findIndex(r=>r.playerId===p.playerId)===i),multipleGames=rec&&new Set(rec.holders.map(p=>p.gameId)).size>1;return `<div class="highlight-card"><div class="highlight-card-overlay"></div><div class="highlight-card-content"><div class="highlight-title">${label}</div><div class="highlight-value">${first?h(A.fmt(first.value)):'—'}</div><div class="highlight-player">${holders?.map(p=>profileLink(data,p.playerId,season)).join(' · ')||'Nessun record disponibile'}</div><div class="highlight-opponent">${multipleGames?'Più partite · vedi Top 10':game?h(game.opponent):''}</div><div class="highlight-date">${game&&!multipleGames?date(game.date):''}</div><p class="bh-note" title="${rec?h(coverage(rec)):''}">${rec?(rec.complete?'Copertura completa':'Copertura parziale'):''}</p><a class="highlight-cta" href="${h(A.href('top_prestazioni.html',{stat:key==='ast'?'asst':key,stagione:season}))}">Top 10 →</a></div></div>`;}).join('');
      byId('record-performances-dots').replaceChildren();section.replaceChildren();
      const title=document.createElement('h2');title.className='stats-section-title';title.textContent='STATISTICHE INDIVIDUALI';section.append(title);
      if(!summary){section.insertAdjacentHTML('beforeend','<p class="bh-empty">Stagione non disponibile.</p>');return;}
      section.append(statsTable(data,summary.individual,mode,season));
      const teamTitle=document.createElement('h2');teamTitle.className='stats-section-title';teamTitle.textContent='BREWERS · STATISTICHE DI SQUADRA';section.append(teamTitle);
      const note=document.createElement('p');note.className='bh-note';note.textContent=`${summary.team.gamesWithResult} gare con risultato · ${summary.team.gamesWithBoxScore} con statistiche. — dato non disponibile; * dato parziale. Le medie usano le gare rilevate per ciascuna metrica.`;section.append(note,statsTable(data,[summary.team],mode,season,true));
    }render();
  });}
  async function top(){
    const requested=new URLSearchParams(location.search).get('stat'),key=requested==='asst'?'ast':cats.some(c=>c[0]===requested)?requested:'pts',label=cats.find(c=>c[0]===key)[1];
    document.querySelector('.page-badge').textContent='TOP 10';byId('pageTitle').textContent='Top 10 · '+label;document.title='Top 10 '+label+' · Brewers';
    byId('pageSub').textContent='Le migliori prestazioni disponibili.';
    const tableWrap=document.querySelector('.table-wrap');tableWrap.tabIndex=0;tableWrap.setAttribute('aria-label','Classifica Top 10; scorrimento orizzontale');
    const numberHead=document.querySelector('.top25-table thead th:nth-child(3)');numberHead.classList.add('col-num');numberHead.title='Numero attuale del profilo; il referto conserva quello registrato nella partita, quando disponibile.';
    return run(['top25Body'],data=>{
    let season=A.seasonFrom(data);select(document.querySelector('.page-header'),data,season,s=>{season=s;render();});
    function render(){
      const rec=season?data.records(season)?.[key]:null,showNumber=!!rec?.top10.some(r=>currentNumber(data.players.get(r.playerId))!=null);numberHead.hidden=!showNumber;numberHead.textContent='Maglia';
      document.querySelector('.back-link').href=A.href('stats.html',{stagione:season});
      byId('pageSub').textContent=rec?'Le migliori prestazioni disponibili · '+A.label(season)+' · '+coverage(rec)+'. Pari merito conservati alla decima posizione.':'Stagione non disponibile.';
      byId('statSwitch').innerHTML=cats.map(([k,l])=>`<a class="${k===key?'active':''}" href="${h(A.href('top_prestazioni.html',{stat:k==='ast'?'asst':k,stagione:season}))}">${l}</a>`).join('');
      byId('top25Body').innerHTML=rec?.top10.map(r=>{const g=data.games.get(r.gameId),tied=rec.top10.filter(x=>x.rank===r.rank).length>1;return `<tr class="rank-${r.rank}${tied?' tied':''}"><td class="col-rank">${r.rank}</td><td class="col-player">${profileLink(data,r.playerId,season,null)}</td><td class="col-num"${showNumber?'':' hidden'}>${h(A.fmt(currentNumber(data.players.get(r.playerId))))}</td><td class="col-opponent">${h(g.opponent)}</td><td class="col-date"><a href="${h(A.gameHref(g))}">${date(g.date)}</a></td><td class="col-value">${h(A.fmt(r.value))}</td></tr>`;}).join('')||'<tr><td colspan="6" class="table-empty">Nessuna prestazione disponibile.</td></tr>';
    }render();
  });}
  function eventRow(g){const away=g.homeAway==='away';return {_bh:g,Data:g.date,Ora:g.time,Luogo:g.venue?.name||'',Turno:g.roundLabel,'Squadra Casa':away?g.opponent:'BREWERS','Squadra Trasferta':away?'BREWERS':g.opponent,'Punteggio Casa':g.result?(away?g.result.opponent:g.result.brewers):null,'Punteggio Trasferta':g.result?(away?g.result.brewers:g.result.opponent):null};}
  const gameLabel=g=>(g.homeAway==='home'?'vs ':g.homeAway==='away'?'@ ':'Brewers · ')+g.opponent;
  const gameWhen=g=>date(g.date)+(g.time?' · '+g.time:' · Orario non disponibile');
  const gameOrder=(a,b)=>a.date.localeCompare(b.date)||(a.time||'24:00').localeCompare(b.time||'24:00')||a.gameId.localeCompare(b.gameId);
  async function calendar(apply){return run(['future-events','past-events'],data=>{
    let season=A.seasonFrom(data);select(document.querySelector('.container'),data,season,s=>{season=s;render();});
    function render(){const games=data.schedule(season).slice().sort(gameOrder);
      const events=games.map(g=>({dataISO:g.date,titolo:gameLabel(g),luogo:g.venue?.name||'Luogo non disponibile',indirizzo:'',tipo:g.result?(g.result.brewers>g.result.opponent?'vittoria':g.result.brewers<g.result.opponent?'sconfitta':'generico'):'in_programma',raw:eventRow(g)}));
      const focus=games.find(g=>g.status==='scheduled')||games.at(-1);apply(events,focus?.date||null);
      let status=byId('bh-calendar-status');if(!status){status=document.createElement('p');status.id='bh-calendar-status';status.className='bh-note';byId('bh-season-wrap').after(status);}status.textContent=games.length?`${games.length} partite · ${A.label(season)}. Orari e luoghi mancanti sono indicati come non disponibili.`:season?'Nessuna partita disponibile per questa stagione.':'Stagione non disponibile.';
      byId('detail-content').style.display='none';byId('detail-empty').style.display='block';
    }render();
  });}
  function calendarDetail(iso,list,id){
    const ev=list.find(e=>e.raw._bh.gameId===id)||list[0];if(!ev)return;const g=ev.raw._bh;
    byId('detail-empty').style.display='none';byId('detail-content').style.display='block';byId('det-title').textContent=gameLabel(g);
    byId('det-meta').innerHTML=`<p><strong>Data:</strong> ${date(g.date)}</p><p><strong>Ora:</strong> ${h(g.time||'Non disponibile')}</p><p><strong>Luogo:</strong> ${h(g.venue?.name||'Non disponibile')}</p>${g.homeAway?`<p>${g.homeAway==='home'?'Casa':'Trasferta'}</p>`:''}${g.roundLabel?`<p>${h(g.roundLabel)}</p>`:''}${g.competitionGroup?`<p>${h(g.competitionGroup)}</p>`:''}<p>${g.result?`Brewers ${g.result.brewers} – ${g.result.opponent} ${h(g.opponent)}`:'In programma · risultato non disponibile'}</p>`;
    if(list.length>1){const menu=document.createElement('select');menu.setAttribute('aria-label','Partita della giornata');for(const item of list){const option=document.createElement('option');option.value=item.raw._bh.gameId;option.textContent=item.titolo;option.selected=option.value===g.gameId;menu.append(option);}menu.addEventListener('change',()=>calendarDetail(iso,list,menu.value));byId('det-meta').prepend(menu);}
    byId('det-actions').innerHTML=`<a class="icon-btn" href="${h(A.gameHref(g))}">${g.boxScoreAvailable?'Statistiche':'Dettagli partita'}</a>${g.venue?.mapsUrl?`<a class="icon-btn" href="${S.linkAttr(g.venue.mapsUrl)}" target="_blank" rel="noopener noreferrer">Maps</a>`:''}`;
  }
  async function historicalMatch(slug){
    let editorialDate=String(slug).split('/').pop().match(/^(\d{8})/)?.[1];
    byId('team1').textContent='Partita d’archivio';byId('team2').textContent='';byId('score').textContent='—';byId('final').textContent='Archivio';byId('stats-header').hidden=true;
    byId('players-stats').innerHTML='<p class="bh-note">Statistiche ufficiali non disponibili per questa partita.</p>';
    // Exact existing manifest URL only. Archived final score is editorial context;
    // never load its player rows into official BH statistics, records or rankings.
    try{const file=await global.BrewersData.resolveMatch(slug),response=await fetch(file.download_url);if(!response.ok)throw Error('ARCHIVE_UNAVAILABLE');const rows=await response.json();if(!Array.isArray(rows))throw Error('ARCHIVE_FORMAT');
      const teams=rows.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)&&typeof r.Number!=='number'),brewers=teams.find(r=>String(r['Player ID']||'').toLowerCase().includes('brewers'))||teams[0],opponent=teams.find(r=>r!==brewers);
      if(brewers)byId('team1').textContent=S.text(brewers['Player ID']);if(opponent)byId('team2').textContent=S.text(opponent['Player ID']);
      const score=r=>r&&((typeof r.pts==='number')||(typeof r.pts==='string'&&r.pts.trim()!==''))&&Number.isFinite(Number(r.pts))&&Number(r.pts)>=0?Number(r.pts):null,a=score(brewers),b=score(opponent);
      if(a!==null&&b!==null){byId('score').textContent=a+' – '+b;byId('final').textContent='Finale · Archivio';}
      if(global.extractDatePrefixFromMatchData)editorialDate=global.extractDatePrefixFromMatchData(rows)||editorialDate;
    }catch(_){/* Keep the editorial route available, without a guessed score. */}
    if(editorialDate&&global.renderArticleVideoCards)await global.renderArticleVideoCards(editorialDate);
  }
  async function match(slug){return run(['players-stats','right-panel'],async data=>{
    const g=data.match(slug);
    if(!g){await historicalMatch(slug);return;}
    byId('team1').innerHTML='<div class="team-name">BREWERS</div>';byId('team2').innerHTML=`<div class="team-name">${h(g.opponent)}</div>`;byId('score').textContent=g.result?g.result.brewers+' – '+g.result.opponent:'—';byId('final').textContent=g.status==='finished'?'Finale':'In programma';
    const meta=document.createElement('p');meta.className='bh-note';meta.textContent=`${A.label(g.seasonId)} · ${date(g.date)} · ${g.time||'Orario non disponibile'} · ${g.venue?.name||'Luogo non disponibile'}${g.roundLabel?' · '+g.roundLabel:''}${g.competitionGroup?' · '+g.competitionGroup:''}`;document.querySelector('.teams').after(meta);
    byId('stats-header').hidden=true;
    const box=data.box(g.gameId);if(!box){byId('players-stats').innerHTML='<div class="bh-empty">Statistiche non disponibili per questa partita.</div>';return;}
    byId('players-stats').replaceChildren(detailTable(data,box.players.filter(p=>p.played),g.seasonId,{box:true}));
    const guide=document.createElement('p');guide.className='bh-note';guide.textContent='Scorri il tabellino per tutte le colonne. R/T = realizzati/tentati; RO/RD = rimbalzi offensivi/difensivi; REC = recuperi; PER = palle perse. — dato non rilevato, 0 valore registrato.';byId('players-stats').append(guide);
    const quarters=periodTable(g,box);document.querySelector('.left-panel').append(quarters);
    const right=byId('right-panel');right.innerHTML=`<section class="summary-card bh-team-only"><h2>Brewers · Squadra</h2><div class="summary-grid">${fields.map(([k,label])=>`<div class="metric"><div class="label">${label}</div><div class="value">${h(A.fmt(box.team.stats[k]))}</div></div>`).join('')}</div><p class="bh-note">— dato non rilevato. Statistiche dei soli Brewers.</p></section>`;
    // Editorial association is explicit through approved match aliases, never a date-only join of sports data.
    const aliases=Object.entries(data.docs['aliases.json'].matches).filter(([,id])=>id===g.gameId).map(([name])=>name);
    const prefix=aliases.length===1?aliases[0].match(/^(\d{8})/):null;if(prefix&&global.renderArticleVideoCards)await global.renderArticleVideoCards(prefix[1]);
  });}
  // Explicit links verified against the public roster, the season workbook and the BH export.
  const editorialProfiles = new Map([
    ['alessandro_camaiti','p_a9151c40413f4be656eff864'],
    ['giovanni_grasso','p_c0b63ad808bb3ecf151e1986'],
    ['matteo_kushoro','p_61313ed169d65b5d5e247051'],
    ['edoardo_vanetti','p_b404347cbaa2aa607c5cf5a5']
  ]);
  async function profile(){
    const params=new URLSearchParams(location.search),requested=params.get('giocatore');
    byId('stats-grid').textContent='Caricamento delle statistiche…';
    byId('player-img').style.display='none';byId('video-section').style.display='none';let bio=null;
    async function readBio(slug){
      if(!slug||/^[ph]_[a-f0-9]{24}$/.test(slug)||A.isDemoProfile(slug))return null;
      try{
        const response=await fetch('roster/stats/'+S.file(slug)+'.json');
        if(response.ok)return await response.json();
        if(response.status!==404)return null;
        const registry=await fetch('roster/multiseason/identities.json');
        if(!registry.ok)return null;
        const archive=await registry.json();
        const person=archive.schemaVersion===1&&archive.people.find(p=>p.profileSlug===slug);
        return person?{nome:person.name,immagine:person.imagePath}:null;
      }catch(_){return null;}
    }
    function showBio(player,editorial){byId('player-name').textContent=(editorial?[editorial.nome,editorial.cognome].filter(Boolean).join(' '):player?.displayName||'Profilo sportivo')+(currentNumber(player)!=null?' · #'+currentNumber(player):'');const bioText=editorial?(editorial.bio||''):(player?'Profilo editoriale non disponibile.':'');byId('player-bio').textContent=bioText;byId('player-bio').hidden=!bioText;const image=editorial?.immagine||player?.imageUrl;if(image){byId('player-img').src=S.resource(image);byId('player-img').style.display='';}}
    bio=await readBio(requested);showBio(null,bio);
    return run(['stats-grid'],async data=>{
      const linkedPlayer=data.players.get(editorialProfiles.get(requested));
      const player=data.player(requested)||(!linkedPlayer?.profileSlug?linkedPlayer:null);
      const editorialSlug=player&&[...editorialProfiles].find(([,id])=>id===player.playerId)?.[0];
      const canonical=player?.profileSlug||(editorialSlug&&!data.player(editorialSlug)?editorialSlug:requested);
      if(canonical!==requested){const u=new URL(location.href);u.searchParams.set('giocatore',canonical);history.replaceState(null,'',u);bio=await readBio(canonical);}
      showBio(player,bio);const link=document.createElement('link');link.rel='canonical';link.href=A.href('roster_details.html',{giocatore:canonical});document.head.append(link);
      let editorialInfo=null;try{const r=await fetch('roster/brewers_roster.json');if(r.ok){const roster=await r.json();editorialInfo=[...(roster.players||[]),...(roster.honorary_members||[])].find(p=>p.idpl===canonical);}}catch(_){}
      if(editorialInfo){const p=document.createElement('p');p.className='bh-note';p.textContent=[editorialInfo.role,editorialInfo.number?'Numero nel profilo pubblico: '+editorialInfo.number:''].filter(Boolean).join(' · ');byId('player-bio').after(p);}
      let season=A.seasonFrom(data),mode='total';
      const seasonMatch=/^(20\d{2})[/-](?:20)?(\d{2})$/.exec(params.get('stagione')||'');
      const normalizedSeason=seasonMatch&&seasonMatch[1]+'-'+seasonMatch[2];
      if(!season&&data.current.allowedSeasonIds.includes(normalizedSeason))season=normalizedSeason;
      if(!params.has('stagione')&&player)season=[...data.current.allowedSeasonIds].reverse().find(s=>data.summary(s)?.individual.some(p=>p.playerId===player.playerId&&p.gamesPlayed>0))||season;
      select(byId('stats-section'),data,season,s=>{season=s;render();});
      const panel=document.createElement('div');panel.id='bh-profile-details';byId('stats-grid').after(panel);
      function heading(text){const h2=document.createElement('h2');h2.textContent=text;return h2;}
      function render(){const row=season&&player?data.summary(season)?.individual.find(p=>p.playerId===player.playerId):null;byId('stats-title').textContent='Medie · '+(season?A.label(season):'Stagione non disponibile');byId('games-badge').textContent=row?row.gamesPlayed+' gare':'Gare non disponibili';byId('stats-grid').innerHTML=row?fields.map(([key,title])=>`<div class="stat-card"><h3>${title}</h3><p>${cell(row.metrics[key],'avg')}</p></div>`).join(''):'<p class="bh-empty">Statistiche non disponibili per il profilo e la stagione selezionati. Nessuna associazione viene dedotta dal nome.</p>';panel.replaceChildren();
        const note=document.createElement('p');note.className='bh-note';note.textContent='— dato non disponibile; * dato parziale. Le medie usano le gare rilevate per ciascuna metrica. Le percentuali richiedono dati di tiro completi e tentativi maggiori di zero.';panel.append(note,heading('Tabellino · '+(season?A.label(season):'Stagione non disponibile')));
        const buttons=document.createElement('div');buttons.className='bh-controls';for(const [v,label]of [['total','Totali'],['avg','Medie']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.profileMode=v;b.setAttribute('aria-pressed',String(v===mode));b.addEventListener('click',()=>{mode=v;render();});buttons.append(b);}panel.append(buttons,detailTable(data,row?[row]:[],season,{mode,names:false}));
        const career=player?data.summary('all')?.individual.find(p=>p.playerId===player.playerId):null;panel.append(heading('Carriera · stagioni esportate dal 2024/25'));
        if(career){const n=document.createElement('p');n.className='bh-note';n.textContent=career.gamesPlayed+' presenze complessive. Totali e medie provengono dall’aggregato BH di tutte le stagioni esportate.';panel.append(n,heading('Totali carriera'),detailTable(data,[career],'all',{names:false}),heading('Medie carriera'),detailTable(data,[career],'all',{names:false,mode:'avg'}));}
        panel.append(heading('Stagioni disputate'));const list=document.createElement('ul');list.className='bh-note';if(player)for(const sid of data.current.allowedSeasonIds){const r=data.summary(sid)?.individual.find(p=>p.playerId===player.playerId);if(!r||!r.gamesPlayed)continue;const li=document.createElement('li');li.textContent=A.label(sid)+' · '+r.gamesPlayed+' gare · '+(Object.values(r.metrics).every(m=>m.complete)?'metriche complete':'metriche parziali: vedere copertura dei singoli dati');list.append(li);}panel.append(list);
      }document.documentElement.style.visibility='visible';render();
    });
  }
  function homeCard(row,opts={},small=false){const g=row._bh,score=g.result?`${g.result.brewers}–${g.result.opponent}`:'',letter=g.result?(g.result.brewers>g.result.opponent?'W':g.result.brewers<g.result.opponent?'L':'T'):'';const result=g.result?`<span class="event-result"><span class="result-letter ${letter==='W'?'win':letter==='L'?'loss':''}">${letter}</span><span class="result-score">${score}</span></span>`:'';const link=`<a class="btn-brewers btn-icon" href="${h(A.gameHref(g))}" aria-label="Dettagli partita">↗</a>`;const text=`<div class="event-date">${date(g.date)}${g.time?' · '+h(g.time):''}</div><div class="event-name">${h(gameLabel(g))}</div><div class="event-location">${h(g.venue?.name||'Luogo non disponibile')}</div>`;return small?`<div class="small-card"><div class="small-card-info">${text}</div><div class="score-right">${result}${link}</div></div>`:`<div class="big-card"><img src="articoli_per_news/images/${opts.future?'20250215_@FortitudoCeriano.jpg':'20241113_@Peacox_articolo.jpg'}" alt="Brewers Basket"><div class="big-card-info">${text}<div class="event-result-wrapper">${result}${link}</div></div></div>`;}
  async function homeCalendar(){return run(['past-dynamic','future-dynamic'],data=>{const games=data.schedule(data.current.currentSeasonId).slice().sort(gameOrder),past=games.filter(g=>g.status==='finished'),future=games.filter(g=>g.status==='scheduled');
    byId('past-dynamic').innerHTML=past.slice(-5).reverse().map((g,i)=>homeCard(eventRow(g),{future:false},i>0)).join('')||'<div class="small-card bh-empty">Nessun risultato disponibile.</div>';
    byId('future-dynamic').innerHTML=future.slice(0,4).map((g,i)=>homeCard(eventRow(g),{future:true},i>0)).join('')||'<div class="small-card bh-empty">Nessuna partita in programma.</div>';
    if(global.buildMarquee)global.buildMarquee(past.length?eventRow(past.at(-1)):null,future.length?eventRow(future[0]):null);
  });}
  async function homeLeaders(){const data=await A.load(),summary=data.summary(data.current.currentSeasonId);notice(data);return {season:A.label(data.current.currentSeasonId),categories:[['pts','Punti','PPG'],['reb','Rimbalzi','RPG'],['ast','Assist','APG'],['stl','Rubate','SPG'],['blk','Stoppate','BPG'],['min','Minuti','MPG']].map(([key,label,unit])=>({key,label,unit,players:(summary.leaderboards[key]?.averages||summary.individual.filter(p=>p.gamesPlayed>=3&&p.metrics[key].complete&&p.metrics[key].average>0).map(p=>({playerId:p.playerId,value:p.metrics[key].average})).sort((a,b)=>b.value-a.value||a.playerId.localeCompare(b.playerId))).slice(0,3).map(row=>{const p=data.players.get(row.playerId);return {id:p.profileSlug||p.playerId,name:p.displayName,img:p.imageUrl,avg:row.value,season:data.current.currentSeasonId};})}))};}
  function homeTile(p,unit,rank){return `<a class="player-tile rank-${rank+1}" href="${h(A.href('roster_details.html',{giocatore:p.id,stagione:p.season}))}"><span class="rank-medal">${rank+1}</span><div class="player-avatar">${p.img?`<img src="${S.imageAttr(p.img)}" alt="">`:''}</div><div class="player-info"><div class="player-name">${h(p.name)}</div><div class="player-avg"><span class="val">${h(A.fmt(p.avg))}</span><span class="unit"> ${unit}</span></div></div></a>`;}
  global.BrewersSportsPages=Object.freeze({stats,top,calendar,calendarDetail,match,profile,homeCalendar,homeLeaders,homeCard,homeTile,gameLabel,gameWhen});
})(window);
