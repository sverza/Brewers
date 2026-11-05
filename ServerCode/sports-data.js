/* Static public sports contract consumer. No backend, credentials or source-side queries. */
(function(global){
  'use strict';
  const config=global.BrewersSportsSource||{}, root=new URL('../',document.currentScript.src);
  const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  // Only an explicit disabled configuration selects legacy mode. A missing config fails closed.
  const enabled=config.enabled!==false;
  if(enabled)document.documentElement.classList.add('sports-bh');
  let pending=null;
  const fail=code=>{throw new Error(code);};
  const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
  function confined(path){
    if(typeof path!=='string'||path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>p==='..'||p==='.'||/%/i.test(p)))fail('SPORTS_PATH');
    const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))fail('SPORTS_ORIGIN');return url;
  }
  async function request(path){const r=await fetch(confined(path),{cache:'no-store'});if(!r.ok)fail('SPORTS_UNAVAILABLE');const text=await r.text();if(new TextEncoder().encode(text).length>4*1024*1024)fail('SPORTS_SIZE');return text;}
  async function validate(artifact){
    const C=global.BrewersSports,c=artifact.current;
    if(!C||!c||c.schemaVersion!==C.VERSION||c.provider!=='brewers-hub'||!Array.isArray(c.files)||c.files.length>2000||!/^[a-f0-9]{64}$/.test(c.releaseId))fail('SPORTS_SCHEMA');
    const hashes=new Map(),docs=Object.create(null),prefix='sports/v1/releases/'+c.releaseId+'/';
    for(const entry of c.files){
      if(typeof entry.path!=='string'||!entry.path.startsWith(prefix))fail('SPORTS_PATH');
      const text=artifact.files[entry.path];if(typeof text!=='string')fail('SPORTS_INCOMPLETE');
      hashes.set(text,await sha(text));const data=JSON.parse(text),body={};
      for(const key of Object.keys(data))if(!['schemaVersion','releaseId'].includes(key))body[key]=data[key];
      docs[entry.path.slice(prefix.length)]=body;
    }
    const semantic=C.canonical({schemaVersion:C.VERSION,provider:'brewers-hub',currentSeasonId:c.currentSeasonId,allowedSeasonIds:c.allowedSeasonIds,completeness:c.completeness,documents:docs});
    hashes.set(semantic,await sha(semantic));
    C.validateArtifact(artifact,text=>hashes.has(text)?hashes.get(text):fail('SPORTS_HASH_INPUT'));
    return {current:c,docs};
  }
  async function retrieve(){
    if(!enabled)fail('SPORTS_DISABLED');if(config.enabled!==true)fail('SPORTS_CONFIG');if(config.preview&&!local)fail('QA_LOCAL_ONLY');
    const currentPath=config.current||'sports/v1/current.json';confined(currentPath);
    const raw=await request(currentPath),current=JSON.parse(raw);
    if(current.schemaVersion!=='brewers-public-sports-v1'||!Array.isArray(current.files)||current.files.length>2000||!/^[a-f0-9]{64}$/.test(current.releaseId))fail('SPORTS_SCHEMA');
    const files={'sports/v1/current.json':BrewersSports.canonical(current)+'\n'};
    const prefix='sports/v1/releases/'+current.releaseId+'/';
    const mount=currentPath.slice(0,-'sports/v1/current.json'.length);
    if(!currentPath.endsWith('sports/v1/current.json'))fail('SPORTS_PATH');
    // Six concurrent static reads at most; every file belongs to this one release.
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(6,current.files.length)},async()=>{while(cursor<current.files.length){const entry=current.files[cursor++];if(typeof entry.path!=='string'||!entry.path.startsWith(prefix))fail('SPORTS_PATH');confined(entry.path);files[entry.path]=await request(mount+entry.path);}}));
    const {docs}=await validate({format:'brewers-public-sports-artifact-v1',current,files});
    const players=new Map(docs['players.json'].players.map(p=>[p.playerId,p]));
    const games=new Map(current.allowedSeasonIds.flatMap(s=>docs['seasons/'+s+'/schedule.json'].games).map(g=>[g.gameId,g]));
    return Object.freeze({current,docs,players,games,
      schedule:season=>season==='all'?[...games.values()]:docs['seasons/'+season+'/schedule.json']?.games||[],
      summary:season=>docs[season==='all'?'all-time.json':'seasons/'+season+'/summary.json']||null,
      records:season=>docs['records.json'][season==='all'?'all-time':season]||null,
      box:id=>docs['games/'+id+'.json']||null,
      match:slug=>{const clean=String(slug||'').replace(/^partite\//,'').replace(/\.json$/i,'');const id=games.has(clean)?clean:docs['aliases.json'].matches[clean]||docs['aliases.json'].matches[clean.split('/').pop()];return typeof id==='string'?games.get(id)||null:null;},
      player:slug=>players.get(slug)||players.get(docs['aliases.json'].profiles[slug])||null});
  }
  function load(){if(!pending)pending=retrieve().catch(e=>{pending=null;throw e;});return pending;}
  function seasonFrom(data,all=true){const value=new URLSearchParams(location.search).get('stagione');return value==='all'&&all?'all':data.current.allowedSeasonIds.includes(value)?value:value?null:data.current.currentSeasonId;}
  const label=season=>season==='all'?'Tutte le stagioni':String(season).replace('-','/');
  function href(page,params){const u=new URL(page,root);for(const [k,v]of Object.entries(params))if(v!==null&&v!==undefined)u.searchParams.set(k,v);return u.pathname+u.search;}
  const gameHref=g=>href('risultati_partite.html',{partita:g.gameId,stagione:g.seasonId});
  const playerHref=(p,season)=>href('roster_details.html',{giocatore:p.profileSlug||p.playerId,stagione:season});
  const fmt=value=>value===null||value===undefined?'—':Number(value).toLocaleString('it-IT',{maximumFractionDigits:1});
  const isDemoProfile=slug=>config.preview===true&&Array.isArray(config.previewProfiles)&&config.previewProfiles.includes(slug);
  global.BrewersSportsSite=Object.freeze({enabled,preview:config.preview===true,previewLabel:local&&config.preview===true&&typeof config.previewLabel==='string'?config.previewLabel.slice(0,200):null,isDemoProfile,load,validate,seasonFrom,label,href,gameHref,playerHref,fmt});
})(window);
