/* Shared pure code for Apps Script V8 and the isolated Node QA harness. No network. */
var BrewersSports = (function () {
  'use strict';
  const VERSION='brewers-public-sports-v1';
  const RAW=['pts','min','oreb','dreb','ast','stl','blk','foul','to','fgm','fga','tpm','tpa','ftm','fta'];
  const METRICS=RAW.concat(['reb','twoMade','twoAttempted']);
  const RECORDS=['pts','ast','reb','stl','ftm','tpm'];
  const errorCodes=new WeakMap();
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function exception(code) { const error=new Error(code);errorCodes.set(error,code);return error; }
  function fail(code) { throw exception(code); }
  function canonical(value) {
    if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
    if(value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    if(typeof value==='number' && !Number.isFinite(value)) fail('NON_FINITE');
    if(value===undefined) fail('UNDEFINED');
    return JSON.stringify(value);
  }
  function clone(value) { return JSON.parse(canonical(value)); }
  function text(value,limit) {
    if(value===null || value===undefined || value==='') return null;
    if(typeof value!=='string' || value.length>(limit||200) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('TEXT_TYPE');
    return value.trim() || null;
  }
  function season(value) {
    const m=/^(20\d{2})[/-](\d{2})$/.exec(String(value||''));
    if(!m || +m[1]<2024 || (+m[1]+1)%100!==+m[2]) fail('SEASON_DENIED');
    return m[1]+'-'+m[2];
  }
  function id(value) { if(typeof value!=='string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) fail('ID_INVALID'); return value; }
  function date(value) {
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) fail('DATE_INVALID');
    return value;
  }
  function number(value) {
    if(value===null || value===undefined) return null;
    if(typeof value!=='number' || !Number.isFinite(value) || value<0) fail('NUMBER_INVALID');
    return value;
  }
  function https(value) {
    const s=text(value,1000);
    // URL in Apps Script is not universally available; strict HTTPS syntax, no credentials/control chars.
    if(!s) return null;
    if(!/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:[/?#][^\s\\]*)?$/.test(s)) fail('URL_DENIED');
    return s;
  }
  function keys(value,allowed) {
    if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k))) fail('SCHEMA_KEYS');
  }
  function pick(value,names) { const out={}; for(const k of names) if(value && own(value,k)) out[k]=clone(value[k]); return out; }
  function selectedGame(g) {
    const out=pick(g,['eventId','season','historical','gameDate','matchLabel','teamName','opponent','homeAway','scoreFor','scoreAgainst','source','schemaVersion','dataQuality','easyStatsTeamId','quarterScores']);
    if(!Array.isArray(g.players)) fail('PLAYERS_TYPE');
    out.teamStats=pick(g.teamStats,RAW.concat(['secondsPlayed']));
    out.players=g.players.map(p=>pick(p,RAW.concat(['secondsPlayed','memberId','sourceName','played','easyStatsPlayerId'])));
    return out;
  }
  // Only an explicitly approved legacy key AND game scope can bypass the member lookup.
  // Never use names/jerseys as keys, and never fall back here for a populated memberId.
  function historicalIdentity(g,p,config,hash) {
    if(p.memberId) return null;
    if(g.historical!==true || g.source==='recorder') fail('MEMBER_MISSING');
    if(![g.easyStatsTeamId,p.easyStatsPlayerId].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x)))fail('MEMBER_MISSING');
    const policies=config.historicalIdentities||[];
    if(!Array.isArray(policies)||policies.length>100) fail('HISTORICAL_POLICY');
    const matches=policies.filter(r=>r.seasonId===season(g.season) && r.teamId===g.easyStatsTeamId && r.legacyPlayerId===p.easyStatsPlayerId);
    if(matches.length!==1) fail('MEMBER_MISSING');
    const r=matches[0];keys(r,['seasonId','teamId','legacyPlayerId','gameIds','authorized','displayName','jerseyNumber','profileSlug']);
    if(r.authorized!==true || !Array.isArray(r.gameIds)||!r.gameIds.length||new Set(r.gameIds).size!==r.gameIds.length || !r.gameIds.every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x)) || !r.gameIds.includes(g._id||g.eventId) || !text(r.displayName) || !Number.isInteger(r.jerseyNumber)||r.jerseyNumber<0||r.jerseyNumber>99) fail('MEMBER_MISSING');
    const playerId='h_'+hash(config.idSalt+'|historical|'+canonical(['easy-stats',r.seasonId,r.teamId,r.legacyPlayerId])).slice(0,24);
    if(Object.values(config.crosswalk).some(x=>x.playerId===playerId)) fail('PUBLIC_ID_COLLISION');
    return {playerId,displayName:text(r.displayName),profileSlug:r.profileSlug==null?null:id(r.profileSlug),imageUrl:null,jerseyNumber:r.jerseyNumber};
  }
  function checkPeriods(rows,result){
    if(!Array.isArray(rows)||rows.length<4||rows.length>12)fail('PERIOD_SCHEMA');
    for(let i=0;i<rows.length;i++){const r=rows[i];keys(r,['period','brewers','opponent']);if(r.period!==i+1)fail('PERIOD_SCHEMA');for(const k of ['brewers','opponent'])if(r[k]!==null&&(!Number.isInteger(r[k])||r[k]<0))fail('PERIOD_SCHEMA');}
    if(result&&['brewers','opponent'].some(k=>rows.every(r=>r[k]!==null)&&rows.reduce((s,r)=>s+r[k],0)!==result[k]))fail('PERIOD_RESULT_CONFLICT');
  }
  function publicPeriods(g,result){
    if(g.dataQuality?.quarterScoresReliable!==true||!Array.isArray(g.quarterScores)||!g.quarterScores.length)return null;
    const seen=new Set();for(const r of g.quarterScores){if(!Number.isInteger(r.period)||r.period<1||r.period>12||seen.has(r.period))fail('PERIOD_SCHEMA');seen.add(r.period);}
    const rows=Array.from({length:Math.max(4,...seen)},(_,i)=>{const r=g.quarterScores.find(r=>r.period===i+1);return {period:i+1,brewers:r?number(r.for):null,opponent:r?number(r.against):null};});checkPeriods(rows,result);return rows;
  }
  function selectedEvent(e) { return pick(e,['season','type','date','time','location','mapsLink','opponent','finalResult','competitionGroup','matchday']); }
  function availability(rows,name) {
    if(!Array.isArray(rows)) return {};
    const matches=rows.filter(r=>r.player===name);
    return matches.length===1?matches[0]:{}; // Do not guess ambiguous identities.
  }
  const CSV={pts:'pts',min:'min',oreb:'oreb',dreb:'dreb',ast:'asst',stl:'stl',blk:'blk',foul:'foul',to:'to',fgm:'fg',fga:'fg',tpm:'3pt',tpa:'3pt',ftm:'ft',fta:'ft'};
  function statLine(row,native,cells) {
    const stats={},coverage={};
    for(const key of RAW) {
      const raw=number(row && row[key]);
      const cell=String(cells[CSV[key]]??'').trim();
      let known=native;
      if(!native) known=cell!=='' && cell!=='-' && (/^(fg|3pt|ft)$/.test(CSV[key])?/^\d+\s*-\s*\d+$/.test(cell):/^\d+(?:[.,]\d+)?$/.test(cell));
      stats[key]=known && raw!==null?raw:null;
      coverage[key]=stats[key]===null?'unknown':'known';
      if(key!=='min' && raw!==null && !Number.isInteger(raw)) fail('STAT_INTEGER');
    }
    if(native && own(row,'memberId') && row.secondsPlayed!==undefined) {
      const seconds=number(row.secondsPlayed);
      if(seconds===null) fail('SECONDS_INVALID');
      stats.min=seconds/60; coverage.min='known';
    }
    for(const [made,attempted] of [['fgm','fga'],['tpm','tpa'],['ftm','fta']]) if(stats[made]!==null && stats[attempted]!==null && stats[made]>stats[attempted]) fail('SHOT_COUNTS');
    function derive(k,a,b,subtract) {
      stats[k]=stats[a]===null || stats[b]===null?null:subtract?stats[a]-stats[b]:stats[a]+stats[b];
      if(stats[k]!==null && stats[k]<0) fail('SHOT_COUNTS');
      coverage[k]=stats[k]===null?'unknown':'known';
    }
    derive('reb','oreb','dreb',false); derive('twoMade','fgm','tpm',true); derive('twoAttempted','fga','tpa',true);
    return {stats,coverage};
  }
  function finalResult(value) {
    if(!value) return null;
    const m=/^(\d+)\s*[-:]\s*(\d+)$/.exec(value);
    if(!m) fail('RESULT_INVALID');
    return {brewers:+m[1],opponent:+m[2]};
  }
  function top10(entries) {
    const rows=entries.slice().sort((a,b)=>b.value-a.value || a.playerId.localeCompare(b.playerId) || a.gameId.localeCompare(b.gameId));
    const cutoff=rows.length>10?rows[9].value:-Infinity;
    return rows.filter((r,i)=>i<10 || r.value===cutoff).map((r,i,all)=>({...r,rank:i && r.value===all[i-1].value?all.findIndex(v=>v.value===r.value)+1:i+1}));
  }
  function aggregate(games) {
    const athletes=new Map(); const team={gamesWithResult:0,gamesWithBoxScore:0,metrics:{}};
    function metric(rows,key,totalGames) {
      const values=rows.map(r=>r.stats[key]).filter(v=>v!==null);
      const total=values.length?values.reduce((a,b)=>a+b,0):null;
      return {total,average:values.length?total/values.length:null,validGames:values.length,missingGames:totalGames-values.length,complete:values.length>0 && values.length===totalGames};
    }
    for(const game of games) {
      if(game.result) team.gamesWithResult++;
      if(!game.box) continue;
      team.gamesWithBoxScore++;
      for(const p of game.box.players) if(p.played) {
        if(!athletes.has(p.playerId)) athletes.set(p.playerId,[]);
        athletes.get(p.playerId).push(p);
      }
    }
    const teamRows=games.filter(g=>g.box).map(g=>g.box.team);
    for(const k of METRICS) team.metrics[k]=metric(teamRows,k,team.gamesWithResult);
    const individual=[...athletes].sort(([a],[b])=>a.localeCompare(b)).map(([playerId,rows])=>({playerId,gamesPlayed:rows.length,metrics:Object.fromEntries(METRICS.map(k=>[k,metric(rows,k,rows.length)]))}));
    function shooting(metrics) {
      const out={};
      for(const [name,made,attempted] of [['fgPct','fgm','fga'],['tpPct','tpm','tpa'],['ftPct','ftm','fta']]) out[name]=metrics[made].complete && metrics[attempted].complete && metrics[attempted].total>0?100*metrics[made].total/metrics[attempted].total:null;
      return out;
    }
    individual.forEach(p=>p.shooting=shooting(p.metrics)); team.shooting=shooting(team.metrics);
    const leaderboards={};
    for(const k of ['pts','reb','ast','stl','blk']) {
      const eligible=individual.filter(p=>p.metrics[k].complete);
      leaderboards[k]={totals:eligible.map(p=>({playerId:p.playerId,value:p.metrics[k].total})).filter(p=>p.value>0).sort((a,b)=>b.value-a.value||a.playerId.localeCompare(b.playerId)),averages:eligible.filter(p=>p.gamesPlayed>=3).map(p=>({playerId:p.playerId,value:p.metrics[k].average})).filter(p=>p.value>0).sort((a,b)=>b.value-a.value||a.playerId.localeCompare(b.playerId))};
    }
    leaderboards.games=individual.map(p=>({playerId:p.playerId,value:p.gamesPlayed})).sort((a,b)=>b.value-a.value||a.playerId.localeCompare(b.playerId));
    return {individual,team,leaderboards};
  }
  function recordsFor(allGames,seasons) {
    const scopes={'all-time':allGames}; seasons.forEach(s=>scopes[s]=allGames.filter(g=>g.seasonId===s));
    const records={};
    for(const [scope,games] of Object.entries(scopes)) {
      records[scope]={};
      for(const k of RECORDS) {
        const entries=[]; let missingPerformances=0;
        for(const g of games) if(g.box) for(const p of g.box.players) if(p.played) {
          if(p.stats[k]!==null) entries.push({gameId:g.gameId,playerId:p.playerId,value:p.stats[k]}); else missingPerformances++;
        }
        const gamesWithoutBoxScore=games.filter(g=>g.result && !g.box).length;
        const ranked=top10(entries); records[scope][k]={holders:ranked.filter(r=>r.rank===1 && r.value>0),top10:ranked,knownPerformances:entries.length,missingPerformances,gamesWithoutBoxScore,complete:entries.length>0 && missingPerformances===0 && gamesWithoutBoxScore===0};
      }
    }
    return records;
  }
  function build(cache,config,hash) {
    const seasons=config.seasons.map(season), currentSeasonId=season(cache.settings.currentSeason);
    if(!seasons.includes(currentSeasonId)) fail('CURRENT_SEASON_DENIED');
    const crosswalk=config.crosswalk;
    const publicPlayers=new Map(), allGames=[];
    for(const sid of seasons) {
      const bucket=cache.seasons[sid]; if(!bucket) fail('SEASON_INCOMPLETE');
      const entries=new Map();
      for(const e of bucket.events) {
        if(season(e.season)!==sid || e.type!=='game') fail('EVENT_SCOPE');
        if(entries.has(e._id)) fail('DUPLICATE_EVENT'); entries.set(e._id,{e});
      }
      for(const g of bucket.games) {
        if(season(g.season)!==sid || g.eventId!==g._id) fail('GAME_SCOPE');
        const value=entries.get(g._id)||{};
        if(value.g) fail('DUPLICATE_GAME');
        if(!value.e && !g.historical) fail('ORPHAN_NATIVE_GAME');
        value.g=g; entries.set(g._id,value);
      }
      for(const [sourceId,{e,g}] of entries) {
        const gameId='g_'+hash(config.idSalt+'|game|'+sourceId).slice(0,24);
        const gameDate=date(g?g.gameDate:e.date);
        if(g && e && g.gameDate!==e.date) fail('BH_DATE_CONFLICT');
        const opponent=text(g?g.opponent:e.opponent);
        if(!opponent) fail('OPPONENT_MISSING');
        if(g && e && e.opponent && e.opponent!==g.opponent) fail('BH_OPPONENT_CONFLICT');
        const parsed=finalResult(e && e.finalResult);
        const result=g?{brewers:number(g.scoreFor),opponent:number(g.scoreAgainst)}:parsed;
        if(g && (result.brewers===null || result.opponent===null)) fail('SCORE_MISSING');
        if(parsed && g && canonical(result)!==canonical(parsed)) fail('BH_RESULT_CONFLICT');
        const time=e?text(e.time,5):null;
        if(time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('TIME_INVALID');
        const game={gameId,seasonId:sid,date:gameDate,time,timezone:'Europe/Rome',startsAt:time?config.toUtc(gameDate,time):null,opponent,homeAway:g && ['home','away'].includes(g.homeAway)?g.homeAway:null,venue:e && e.location?{name:text(e.location),mapsUrl:https(e.mapsLink)}:null,roundLabel:text(e && e.matchday || g && g.matchLabel),competitionGroup:text(e && e.competitionGroup),result,status:result?'finished':'scheduled',boxScoreAvailable:!!g};
        if(g) {
          if(g.source==='recorder' && g.schemaVersion!==1) fail('RECORDER_SCHEMA');
          const native=g.source==='recorder' && g.schemaVersion===1;
          const rows=bucket.sources[g._id] || [];
          const players=[],seen=new Set();
          for(const p of g.players) {
            if(typeof p.played!=='boolean') fail('PLAYED_UNKNOWN');
            const historic=historicalIdentity(g,p,config,hash);
            if(historic){if(seen.has(historic.playerId))fail('DUPLICATE_PLAYER');seen.add(historic.playerId);if(publicPlayers.has(historic.playerId)&&canonical(publicPlayers.get(historic.playerId))!==canonical(historic))fail('PUBLIC_ID_COLLISION');publicPlayers.set(historic.playerId,historic);players.push({playerId:historic.playerId,played:p.played,...statLine(p,native,availability(rows,p.sourceName))});continue;}
            const identity=crosswalk[p.memberId];
            if(!identity || identity.authorized!==true) fail('MEMBER_MISSING');
            const playerId=id(identity.playerId); if(seen.has(playerId)) fail('DUPLICATE_PLAYER'); seen.add(playerId);
            const member=cache.members[p.memberId]; if(!member) fail('MEMBER_MISSING');
            const displayName=[text(member.firstName),text(member.lastName)].filter(Boolean).join(' ');
            if(!displayName) fail('PUBLIC_NAME_MISSING');
            const publicRow={playerId,displayName,profileSlug:identity.profileSlug===null?null:id(identity.profileSlug),imageUrl:https(identity.imageUrl)};
            if(publicPlayers.has(playerId) && canonical(publicPlayers.get(playerId))!==canonical(publicRow)) fail('PUBLIC_ID_COLLISION');
            publicPlayers.set(playerId,publicRow);
            players.push({playerId,played:p.played,...statLine(p,native,availability(rows,p.sourceName))});
          }
          players.sort((a,b)=>a.playerId.localeCompare(b.playerId));
          game.box={gameId,seasonId:sid,result,team:statLine(g.teamStats,native,availability(rows,g.teamName)),players};
          const periods=publicPeriods(g,result);if(periods)game.box.periodScores=periods;
          if(game.box.team.stats.pts!==null && game.box.team.stats.pts!==result.brewers) fail('BH_RESULT_CONFLICT');
        }
        allGames.push(game);
      }
    }
    allGames.sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId));
    const docs={'players.json':{players:[...publicPlayers.values()].sort((a,b)=>a.playerId.localeCompare(b.playerId))},'all-time.json':aggregate(allGames),'aliases.json':{matches:{},profiles:{}}};
    for(const sid of seasons) {
      const games=allGames.filter(g=>g.seasonId===sid);
      docs['seasons/'+sid+'/schedule.json']={games:games.map(g=>{const row={}; for(const k of Object.keys(g)) if(k!=='box') row[k]=g[k]; return row;})};
      docs['seasons/'+sid+'/summary.json']=aggregate(games);
    }
    for(const g of allGames) if(g.box) docs['games/'+g.gameId+'.json']=g.box;
    docs['records.json']=recordsFor(allGames,seasons);
    for(const [slug,sourceId] of Object.entries(config.aliases||{})) {
      id(slug); const target=allGames.find(g=>g.gameId==='g_'+hash(config.idSalt+'|game|'+sourceId).slice(0,24));
      docs['aliases.json'].matches[slug]=target?target.gameId:{status:'unavailable'};
    }
    for(const p of publicPlayers.values()) if(p.profileSlug) {
      if(own(docs['aliases.json'].profiles,p.profileSlug)) fail('PROFILE_ALIAS_DUPLICATE');
      docs['aliases.json'].profiles[p.profileSlug]=p.playerId;
    }
    const partial=allGames.some(g=>g.result && !g.box || g.box && [g.box.team,...g.box.players.filter(p=>p.played)].some(r=>Object.values(r.stats).some(v=>v===null)));
    return {schemaVersion:VERSION,provider:'brewers-hub',currentSeasonId,allowedSeasonIds:seasons,completeness:partial?'partial':'complete',documents:docs};
  }
  function packageArtifact(semantic,hash,now,previous) {
    const releaseId=hash(canonical(semantic));
    if(previous && previous.current.releaseId===releaseId) return previous;
    const prefix='sports/v1/releases/'+releaseId+'/',files={},index=[];
    for(const path of Object.keys(semantic.documents).sort()) {
      const value=canonical({schemaVersion:VERSION,releaseId,...semantic.documents[path]})+'\n';
      const full=prefix+path; files[full]=value; index.push({path:full,sha256:hash(value)});
    }
    const current={schemaVersion:VERSION,provider:'brewers-hub',releaseId,generatedAt:now,currentSeasonId:semantic.currentSeasonId,allowedSeasonIds:semantic.allowedSeasonIds,completeness:semantic.completeness,files:index};
    files['sports/v1/current.json']=canonical(current)+'\n';
    return {format:'brewers-public-sports-artifact-v1',current,files};
  }
  function validateArtifact(artifact,hash) {
    keys(artifact,['format','current','files']); if(artifact.format!=='brewers-public-sports-artifact-v1') fail('ARTIFACT_FORMAT');
    const c=artifact.current; keys(c,['schemaVersion','provider','releaseId','generatedAt','currentSeasonId','allowedSeasonIds','completeness','files']);
    if(c.schemaVersion!==VERSION || c.provider!=='brewers-hub' || !/^[a-f0-9]{64}$/.test(c.releaseId) || !Number.isFinite(Date.parse(c.generatedAt))) fail('ARTIFACT_SCHEMA');
    if(!Array.isArray(c.allowedSeasonIds) || !c.allowedSeasonIds.length || new Set(c.allowedSeasonIds).size!==c.allowedSeasonIds.length || !c.allowedSeasonIds.every(s=>season(s)===s) || !c.allowedSeasonIds.includes(c.currentSeasonId)) fail('ARTIFACT_SEASONS');
    if(!['complete','partial'].includes(c.completeness)) fail('ARTIFACT_COMPLETENESS');
    const prefix='sports/v1/releases/'+c.releaseId+'/',docs={},expected=new Set(['sports/v1/current.json']);
    for(const entry of c.files) {
      keys(entry,['path','sha256']); const suffix=entry.path.slice(prefix.length);
      if(!entry.path.startsWith(prefix) || !/^(players|all-time|records|aliases)\.json$|^games\/g_[a-f0-9]{24}\.json$|^seasons\/20\d{2}-\d{2}\/(schedule|summary)\.json$/.test(suffix) || expected.has(entry.path)) fail('ARTIFACT_PATH');
      expected.add(entry.path); const content=artifact.files[entry.path]; if(typeof content!=='string' || hash(content)!==entry.sha256) fail('ARTIFACT_HASH');
      const data=JSON.parse(content); if(data.releaseId!==c.releaseId || data.schemaVersion!==VERSION) fail('ARTIFACT_MIXED_RELEASE');
      docs[suffix]={}; for(const k of Object.keys(data)) if(!['releaseId','schemaVersion'].includes(k)) docs[suffix][k]=data[k];
    }
    if(Object.keys(artifact.files).some(k=>!expected.has(k)) || Object.keys(artifact.files).length!==expected.size || artifact.files['sports/v1/current.json']!==canonical(c)+'\n') fail('ARTIFACT_EXTRA');
    // Reconstituting the semantic hash catches content tampering, not just broken transport.
    const semantic={schemaVersion:VERSION,provider:'brewers-hub',currentSeasonId:c.currentSeasonId,allowedSeasonIds:c.allowedSeasonIds,completeness:c.completeness,documents:docs};
    if(hash(canonical(semantic))!==c.releaseId) fail('ARTIFACT_RELEASE_HASH');
    for(const path of ['players.json','all-time.json','records.json','aliases.json',...c.allowedSeasonIds.flatMap(s=>['seasons/'+s+'/schedule.json','seasons/'+s+'/summary.json'])]) if(!own(docs,path)) fail('ARTIFACT_REQUIRED_FILE');
    // Validate the complete output whitelist independently of source selection.
    const forbidden=new Set(['email','phone','registry','updatedBy','ownerUid','roles','permissions','opponentStats','shotsJson','boxScoreCsv','playByPlayCsv','memberId','nativePlayerId']);
    function inspect(v) { if(Array.isArray(v)) return v.forEach(inspect); if(v && typeof v==='object') { for(const k of Object.keys(v)) { if(forbidden.has(k)) fail('PRIVATE_FIELD'); inspect(v[k]); } } else if(typeof v==='number' && !Number.isFinite(v)) fail('NON_FINITE'); }
    inspect(docs);
    keys(docs['players.json'],['players']);
    const playerIds=new Set(docs['players.json'].players.map(p=>{keys(p,['playerId','displayName','profileSlug','imageUrl','jerseyNumber']); id(p.playerId); if(!text(p.displayName)) fail('PUBLIC_NAME_MISSING'); if(p.profileSlug!==null) id(p.profileSlug); https(p.imageUrl); if(own(p,'jerseyNumber')&&(!/^h_[a-f0-9]{24}$/.test(p.playerId)||!Number.isInteger(p.jerseyNumber)||p.jerseyNumber<0||p.jerseyNumber>99))fail('HISTORICAL_SCHEMA'); return p.playerId;}));
    if(playerIds.size!==docs['players.json'].players.length) fail('DUPLICATE_PLAYER');
    const gameIds=new Set(),publicGames=[];
    for(const path of Object.keys(docs).filter(p=>p.startsWith('seasons/'))) if(!c.allowedSeasonIds.includes(path.split('/')[1])) fail('ARTIFACT_SEASON_PATH');
    for(const sid of c.allowedSeasonIds) {
      const schedule=docs['seasons/'+sid+'/schedule.json']; keys(schedule,['games']);
      for(const g of schedule.games) {
      keys(g,['gameId','seasonId','date','time','timezone','startsAt','opponent','homeAway','venue','roundLabel','competitionGroup','result','status','boxScoreAvailable']); id(g.gameId); date(g.date);
      if(g.seasonId!==sid || gameIds.has(g.gameId)) fail('GAME_REFERENCE'); gameIds.add(g.gameId);
      if(g.boxScoreAvailable && !own(docs,'games/'+g.gameId+'.json')) fail('BOX_REFERENCE');
      if(g.time!==null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(g.time) || g.timezone!=='Europe/Rome' || !['home','away',null].includes(g.homeAway) || typeof g.boxScoreAvailable!=='boolean') fail('SCHEDULE_SCHEMA');
      if(g.startsAt!==null && (typeof g.startsAt!=='string' || !Number.isFinite(Date.parse(g.startsAt)))) fail('SCHEDULE_SCHEMA');
      if(!text(g.opponent)) fail('OPPONENT_MISSING'); text(g.roundLabel); text(g.competitionGroup);
      if(g.venue!==null) { keys(g.venue,['name','mapsUrl']); if(!text(g.venue.name)) fail('VENUE'); https(g.venue.mapsUrl); }
      if(g.result!==null) { keys(g.result,['brewers','opponent']); for(const key of ['brewers','opponent']) if(!Number.isInteger(number(g.result[key]))) fail('RESULT_INVALID'); }
      if(g.status!==(g.result?'finished':'scheduled')) fail('STATUS_INVALID');
      publicGames.push({...g,...(g.boxScoreAvailable?{box:docs['games/'+g.gameId+'.json']}:{})});
      }
    }
    for(const path of Object.keys(docs).filter(p=>p.startsWith('games/'))) {
      const g=docs[path]; keys(g,['gameId','seasonId','result','team','players','periodScores']);
      if(own(g,'periodScores'))checkPeriods(g.periodScores,g.result);
      const schedule=publicGames.find(r=>r.gameId===g.gameId);
      if(!schedule || !schedule.boxScoreAvailable || schedule.seasonId!==g.seasonId || canonical(schedule.result)!==canonical(g.result)) fail('GAME_REFERENCE');
      const seen=new Set();
      for(const row of [g.team,...g.players]) {
        keys(row,row===g.team?['stats','coverage']:['playerId','played','stats','coverage']);
        if(row!==g.team) { if(!playerIds.has(row.playerId) || seen.has(row.playerId) || typeof row.played!=='boolean') fail('PLAYER_REFERENCE'); seen.add(row.playerId); }
        keys(row.stats,METRICS); keys(row.coverage,METRICS);
        if(Object.keys(row.stats).length!==METRICS.length || Object.keys(row.coverage).length!==METRICS.length) fail('METRIC_SCHEMA');
        for(const k of METRICS) if(number(row.stats[k])===null ? row.coverage[k]!=='unknown' : row.coverage[k]!=='known') fail('COVERAGE_SCHEMA');
      }
    }
    // Recompute aggregates and rankings from the validated public boxscores: rejects unknown fields,
    // altered denominators and mismatched summaries without relying on a blacklist.
    for(const [scope,games] of [['all-time',publicGames],...c.allowedSeasonIds.map(s=>[s,publicGames.filter(g=>g.seasonId===s)])]) {
      const path=scope==='all-time'?'all-time.json':'seasons/'+scope+'/summary.json';
      if(canonical(docs[path])!==canonical(aggregate(games))) fail('AGGREGATE_SCHEMA');
    }
    if(canonical(docs['records.json'])!==canonical(recordsFor(publicGames,c.allowedSeasonIds))) fail('RECORD_SCHEMA');
    const aliases=docs['aliases.json']; keys(aliases,['matches','profiles']);
    for(const [slug,gameId] of Object.entries(aliases.matches)) { id(slug); if(typeof gameId==='string') { if(!gameIds.has(gameId)) fail('ALIAS_MISSING'); } else { keys(gameId,['status']); if(gameId.status!=='unavailable') fail('ALIAS_MISSING'); } }
    for(const [slug,playerId] of Object.entries(aliases.profiles)) { id(slug); if(!playerIds.has(playerId)) fail('ALIAS_MISSING'); }
    return true;
  }
  return Object.freeze({VERSION,RAW,METRICS,exception,errorCode:error=>errorCodes.get(error)||null,canonical,clone,season,selectedGame,selectedEvent,historicalIdentity,build,packageArtifact,validateArtifact});
})();
