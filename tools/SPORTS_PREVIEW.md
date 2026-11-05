# Anteprima sportiva locale — Fase 4A.3

In PowerShell:

```powershell
Set-Location C:\Brewers-Site\working\Brewers
python tools/preview_sports.py
```

Aprire http://127.0.0.1:8765/ . Il processo ascolta soltanto sul PC locale.
Per fermarlo: Ctrl+C nella finestra dalla quale è stato avviato.
Se la porta è già occupata dall'anteprima, usare quella esistente oppure `--port 8767`.

I JSON sintetici sono **fuori dal repository**, in
`C:\Brewers-Site\deliverables\phase4a3-preview\public\sports\v1\`.
Il server locale espone soltanto questi file pubblici validati tramite il prefisso
`/__qa_sports__/` e sostituisce in memoria `ServerCode/sports-source.js`.
La configurazione nel repository resta esplicitamente disabilitata: una normale
pubblicazione dei sorgenti non attiva questa anteprima né contiene i dati QA.
La configurazione di anteprima viene inoltre respinta dal consumer su host non locali.

`node C:\Brewers-Site\deliverables\phase4a3-preview\prepare_sports_preview.cjs` ricostruisce offline la stessa fixture
da `qa-artifact.json` e dalla copia locale privata del collaudo 4A.2B già disponibile
nel worktree Hub QA. Usa il contratto originale, senza connessioni Google.
Anche il preparatore e i suoi esempi sintetici sono fuori dal repository pubblico.
Non trasferire cache, configurazioni private o fixture nel repository pubblico.
Il server `--legacy --port 8766` serve invece la configurazione disabilitata e non espone
nessun percorso QA; è solo un confronto locale.

## Contratto e futura attivazione

`ServerCode/sports/contract.js` è la copia integrale del validatore puro
`qa/sports-export/Core.js` del repository Hub QA, aggiornato localmente al commit
`d14b51b30055255d1613fddbd097c2146a2fe838` per le identità storiche approvate.
Schema: `brewers-public-sports-v1`. Il frontend riusa aggregati e classifiche esportati;
il ricalcolo interno al contratto serve esclusivamente a verificarne la coerenza.
Non mantenere una seconda versione delle formule nel consumer.

La futura attivazione richiederà un artefatto reale approvato, alias storici verificati,
pubblicazione coerente dei file della release e infine la configurazione
`enabled:true, preview:false, current:'sports/v1/current.json'`.
Queste operazioni **non vengono eseguite dalla Fase 4A.3**.
Il catalogo delle stagioni e i percorsi delle release provengono da `current.json`.
In caso di errore si mostra indisponibilità; non esiste un fallback implicito ai vecchi
tabellini né una cache persistente che mescoli due versioni.

Report e prove locali: `C:\Brewers-Site\reports\PHASE4A3_SITE_INTEGRATION.md`.

## Anteprima reale read-only — 4A.4B

Il server può ricevere `--artifact` (contenitore locale validato) e `--label`.
I file pubblici corrispondenti devono essere nella cartella `public` accanto al
contenitore. Sono esposti soltanto quelli sotto sports/v1; stato privato, cache e
policy non sono serviti. La configurazione tracciata rimane disabilitata.

```powershell
python tools/preview_sports.py --artifact "C:\Brewers-Site\deliverables\phase4a4b-identities-private\real-validation\artifact-real-local.json" --label "Anteprima locale - Dati reali Brewers Hub (sola lettura)"
```

L'artefatto reale, i suoi dati e le policy sono esterni al repository. Non copiarli
nei fixture QA o nel sito senza autorizzazione al rilascio. La copia del validatore
supporta il solo campo opzionale pubblico jerseyNumber delle identità storiche;
i renderer lo mostrano nei contesti esistenti senza inventare numeri per altri atleti.
Report corrente: `C:\Brewers-Site\reports\PHASE4A4_PRODUCTION_READINESS.md`.
