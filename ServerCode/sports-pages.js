/* Presentation only: all totals, averages, coverage and rankings come from the static export. */
(function(global){
  'use strict';
  const A=global.BrewersSportsSite,S=global.BrewersSafe,h=S.escape;
  const cats=[['pts','Punti'],['ast','Assist'],['reb','Rimbalzi'],['stl','Palle rubate'],['ftm','Liberi segnati'],['tpm','Triple segnate']];
  const fields=[['min','MIN'],['pts','PTS'],['reb','REB'],['ast','AST'],['stl','STL'],['blk','BLK'],['to','PERSE'],['foul','FALLI']];
  const byId=id=>document.getElementById(id),date=iso=>new Date(iso+'T12:00:00').toLocaleDateString('it-IT');
  function notice(data,message){
    let n=byId('bh-source');if(!n){n=document.createElement('div');n.id='bh-source';n.className='bh-source';n.setAttribute('role','status');(byId('header-container')||document.body.firstChild).after(n);}
    n.textContent=message||(A.preview?'Anteprima locale · Dati sportivi QA dimostrativi, non risultati ufficiali':'Dati sportivi · Brewers Hub');
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
  const profileLink=(data,id,season)=>{const p=data.players.get(id);return p?`<a href="${h(A.playerHref(p,season))}">${h(p.displayName)}</a>`:'—';};
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
      byId('record-performances').innerHTML=cats.map(([key,label])=>{const rec=records?.[key],first=rec?.holders[0],game=first&&data.games.get(first.gameId);return `<div class="highlight-card"><div class="highlight-card-overlay"></div><div class="highlight-card-content"><div class="highlight-title">${label}</div><div class="highlight-value">${first?h(A.fmt(first.value)):'—'}</div><div class="highlight-player">${rec?.holders.map(p=>profileLink(data,p.playerId,season)).join(' · ')||'Nessun dato'}</div><div class="highlight-opponent">${game?h(game.opponent):''}</div><div class="highlight-date">${game?date(game.date):''}</div><p class="bh-note">${rec?h(coverage(rec)):''}</p><a class="highlight-cta" href="${h(A.href('top_prestazioni.html',{stat:key==='ast'?'asst':key,stagione:season}))}">Top 10 →</a></div></div>`;}).join('');
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
    return run(['top25Body'],data=>{
    let season=A.seasonFrom(data);select(document.querySelector('.page-header'),data,season,s=>{season=s;render();});
    function render(){
      const rec=season?data.records(season)?.[key]:null;
      document.querySelector('.back-link').href=A.href('stats.html',{stagione:season});
      byId('pageSub').textContent=rec?'Le migliori prestazioni disponibili · '+A.label(season)+' · '+coverage(rec)+'. Pari merito conservati alla decima posizione.':'Stagione non disponibile.';
      byId('statSwitch').innerHTML=cats.map(([k,l])=>`<a class="${k===key?'active':''}" href="${h(A.href('top_prestazioni.html',{stat:k==='ast'?'asst':k,stagione:season}))}">${l}</a>`).join('');
      byId('top25Body').innerHTML=rec?.top10.map(r=>{const g=data.games.get(r.gameId),tied=rec.top10.filter(x=>x.rank===r.rank).length>1;return `<tr class="rank-${r.rank}${tied?' tied':''}"><td class="col-rank">${r.rank}</td><td class="col-player">${profileLink(data,r.playerId,season)}</td><td class="col-num">—</td><td class="col-opponent">${h(g.opponent)}</td><td class="col-date"><a href="${h(A.gameHref(g))}">${date(g.date)}</a></td><td class="col-value">${h(A.fmt(r.value))}</td></tr>`;}).join('')||'<tr><td colspan="6" class="table-empty">Nessuna prestazione disponibile.</td></tr>';
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
  async function match(slug){return run(['players-stats','right-panel'],async data=>{
    const g=data.match(slug);
    if(!g){byId('team1').textContent='Archivio';byId('team2').textContent='';byId('score').textContent='—';byId('final').textContent='Statistiche ufficiali non disponibili';byId('players-stats').innerHTML='<div class="bh-empty">Questo URL storico non è ancora associato a una partita BH. Le statistiche 2023/24 sono escluse dal nuovo sistema.</div>';const prefix=String(slug).split('/').pop().match(/^(\d{8})/);if(prefix&&global.renderArticleVideoCards)await global.renderArticleVideoCards(prefix[1]);return;}
    byId('team1').innerHTML='<div class="team-name">BREWERS</div>';byId('team2').innerHTML=`<div class="team-name">${h(g.opponent)}</div>`;byId('score').textContent=g.result?g.result.brewers+' – '+g.result.opponent:'—';byId('final').textContent=g.status==='finished'?'Finale':'In programma';
    const meta=document.createElement('p');meta.className='bh-note';meta.textContent=`${A.label(g.seasonId)} · ${date(g.date)} · ${g.time||'Orario non disponibile'} · ${g.venue?.name||'Luogo non disponibile'}${g.roundLabel?' · '+g.roundLabel:''}${g.competitionGroup?' · '+g.competitionGroup:''}`;document.querySelector('.teams').after(meta);
    const box=data.box(g.gameId);if(!box){byId('players-stats').innerHTML='<div class="bh-empty">Statistiche non disponibili per questa partita.</div>';return;}
    let key='min',direction=-1;const headers=byId('stats-header').querySelectorAll('[data-key]');
    function render(){const mapped=key==='asst'?'ast':key,rows=box.players.filter(p=>p.played).slice().sort((a,b)=>{const x=mapped==='name'?data.players.get(a.playerId).displayName:a.stats[mapped],y=mapped==='name'?data.players.get(b.playerId).displayName:b.stats[mapped];if(x==null)return y==null?0:1;if(y==null)return -1;return direction*(typeof x==='string'?x.localeCompare(y):x-y);});
      byId('players-stats').innerHTML=rows.map(p=>`<div class="stats-row"><div class="stat-name">${profileLink(data,p.playerId,g.seasonId)}</div>${['min','pts','reb','ast'].map(k=>`<div class="stat">${h(A.fmt(p.stats[k]))}</div>`).join('')}</div>`).join('')||'<div class="bh-empty">Nessuna statistica individuale disponibile.</div>';
      headers.forEach(head=>{head.setAttribute('aria-sort',head.dataset.key===key?(direction===1?'ascending':'descending'):'none');head.querySelector('.sort-indicator').textContent=head.dataset.key===key?(direction===1?'▲':'▼'):'';});}
    headers.forEach(head=>{const sort=()=>{direction=key===head.dataset.key?-direction:head.dataset.key==='name'?1:-1;key=head.dataset.key;render();};head.addEventListener('click',sort);head.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();sort();}});});render();
    const right=byId('right-panel');right.innerHTML=`<section class="summary-card bh-team-only"><h2>Brewers · Squadra</h2><div class="summary-grid">${fields.map(([k,label])=>`<div class="metric"><div class="label">${label}</div><div class="value">${h(A.fmt(box.team.stats[k]))}</div></div>`).join('')}</div><p class="bh-note">— dato non rilevato. Statistiche dei soli Brewers.</p></section>`;
    // Editorial association is explicit through approved match aliases, never a date-only join of sports data.
    const aliases=Object.entries(data.docs['aliases.json'].matches).filter(([,id])=>id===g.gameId).map(([name])=>name);
    const prefix=aliases.length===1?aliases[0].match(/^(\d{8})/):null;if(prefix&&global.renderArticleVideoCards)await global.renderArticleVideoCards(prefix[1]);
  });}
  async function profile(){
    const slug=new URLSearchParams(location.search).get('giocatore');byId('player-img').style.display='none';byId('video-section').style.display='none';
    let bio=null;
    // Biographies remain readable even when the sports export is unavailable.
    if(!A.isDemoProfile(slug)){try{const r=await fetch('roster/stats/'+S.file(slug)+'.json');if(r.ok)bio=await r.json();}catch(_){} }
    byId('player-name').textContent=bio?`${bio.nome} ${bio.cognome}`:'Profilo sportivo';byId('player-bio').textContent=bio?.bio||'';
    if(bio?.immagine){byId('player-img').src=S.resource(bio.immagine);byId('player-img').style.display='';}
    return run(['stats-grid'],async data=>{
      const player=data.player(slug);
      byId('player-name').textContent=bio?`${bio.nome} ${bio.cognome}`:player?.displayName||'Profilo';byId('player-bio').textContent=bio?.bio||(player?'Profilo editoriale non disponibile.':'Identità non associata ai dati sportivi esportati.');
      const image=bio?.immagine||player?.imageUrl;if(image){byId('player-img').src=S.resource(image);byId('player-img').style.display='';}
      let season=A.seasonFrom(data);select(byId('stats-section'),data,season,s=>{season=s;render();});
      function render(){const row=season&&player?data.summary(season)?.individual.find(p=>p.playerId===player.playerId):null;byId('stats-title').textContent='Medie · '+(season?A.label(season):'Stagione non disponibile');byId('games-badge').textContent=row?row.gamesPlayed+' gare':'Gare non disponibili';byId('stats-grid').innerHTML=row?fields.map(([key,title])=>`<div class="stat-card"><h3>${title}</h3><p>${cell(row.metrics[key],'avg')}</p></div>`).join(''):'<p class="bh-empty">Statistiche non disponibili per il profilo e la stagione selezionati.</p>';}
      document.documentElement.style.visibility='visible';render();
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
