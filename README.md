# Brewers Basketball Milano

Sito web del Brewers Basket A.S.D., pubblicato su GitHub Pages all'indirizzo `www.brewersbasketball.it` (vedi `CNAME`). È un sito statico (HTML + CSS + JS vanilla, nessun framework/build step): le pagine caricano i contenuti dinamici a runtime tramite `fetch()`, leggendo file JSON presenti nel repo (spesso via `raw.githubusercontent.com`, non con percorsi relativi).

Per modificare il sito basta modificare i file interessati e fare commit/push su `main`: GitHub Pages e la GitHub Action di rigenerazione manifest fanno il resto (vedi sezione [Automazioni](#automazioni-github-actions)).

## Indice

- [Pagine principali](#pagine-principali)
- [Componenti condivisi (header/footer)](#componenti-condivisi-headerfooter)
- [Dati (JSON) e come modificarli](#dati-json-e-come-modificarli)
- [Fogli di stile](#fogli-di-stile)
- [Automazioni (GitHub Actions)](#automazioni-github-actions)
- [Altro](#altro)

## Pagine principali

| File | Cosa contiene | Come modificarla |
| --- | --- | --- |
| `index.html` | Home page: hero, prossima partita/evento (da `partite/calendario.json`), ultime news (da `articoli_per_news/manifest.json`), risultati recenti (da `partite/manifest.json`). | Testi/hero direttamente nell'HTML; i contenuti dinamici si aggiornano automaticamente aggiungendo articoli/partite (vedi sezione dati), non serve toccare questo file. |
| `home_mobile.html` | Variante della home per la versione mobile. | Modificare l'HTML direttamente; tenerla allineata a `index.html` se cambia la struttura. |
| `article_list.html` | Elenco di tutte le news/articoli del club, letto da `articoli_per_news/manifest.json`. | Non richiede modifiche dirette: basta aggiungere un nuovo file in `articoli_per_news/` (vedi sotto). |
| `article_view.html` / `article_view_v2.html` | Pagina di dettaglio di un singolo articolo (titolo, corpo, immagini), aperta con un parametro in query string che indica quale file JSON caricare da `articoli_per_news/`. `v2` è una versione più recente/alternativa del template. | Per cambiare il layout dell'articolo si modifica il template HTML; il contenuto testuale si modifica nel JSON dell'articolo, non qui. |
| `calendario.html` | Calendario partite ed eventi del club, letto da `partite/calendario.json`, `partite/eventi.json` e dai manifest partite/articoli. | Aggiungere/modificare eventi in `partite/eventi.json` o partite in `partite/calendario.json`; l'HTML gestisce solo la visualizzazione. |
| `risultati_partite.html` | Dettaglio di una partita (tabellino, statistiche giocatori), letto dal file JSON della singola partita dentro `partite/Stagione_*/`. | Il contenuto viene dal JSON della partita; l'HTML va toccato solo per cambiare il layout del tabellino. |
| `roster.html` | Elenco giocatori e staff della squadra, letto da `roster/brewers_roster.json`. | Aggiungere/rimuovere/modificare giocatori e staff in `roster/brewers_roster.json` (vedi sotto). |
| `roster_details.html` | Scheda di dettaglio di un giocatore (foto, statistiche stagionali, partite giocate), letta da `roster/stats/<idpl>.json` e dai manifest partite. | Aggiornare le statistiche nel file JSON del giocatore in `roster/stats/`; niente modifiche HTML necessarie per aggiornare i numeri. |
| `staff_details.html` | Scheda di dettaglio per un membro dello staff, con logica simile a `roster_details.html` (parametro `?giocatore=<id>` e fetch da `roster/stats/<id>.json`). | Aggiornare/creare il file in `roster/stats/` corrispondente all'`id` usato nel link. |
| `stats.html` | Pagina statistiche aggregate della squadra/giocatori, calcolate a partire da `roster/brewers_roster.json` e dai file partite (`partite/manifest.json`, `partite/calendario.json`). | Contenuti generati automaticamente dai dati; modificare l'HTML solo per cambiare grafici/tabelle mostrate. |
| `top_prestazioni.html` | Classifica delle migliori prestazioni individuali della stagione, calcolata dai file partite. | Aggiornata automaticamente aggiungendo/aggiornando i file in `partite/`. |
| `direttivo.html` | Presentazione del direttivo/consiglio del club (foto e testi dei membri). | Contenuto statico scritto direttamente nell'HTML: cercare la card della persona e modificare nome/ruolo/testo/immagine lì. |
| `storia.html` | Cronistoria/storia del club. | Testo statico nell'HTML, da modificare direttamente. |
| `regolamento.html` | Regolamento del club. | Testo statico nell'HTML. |
| `gdpr.html` | Informativa privacy/GDPR su riprese fotografiche e video. | Testo statico nell'HTML. |
| `safeguarding.html` | Policy di safeguarding del club. | Testo statico nell'HTML. |
| `sponsor.html` | Pagina sponsor del club (loghi, descrizioni, gallerie foto in `images/sponsor/`). | Aggiungere immagini in `images/sponsor/<nome_sponsor>/` e aggiornare i riferimenti/testi nell'HTML. |
| `contatti.html` | Informazioni di contatto/sponsorizzazione. | Testo statico nell'HTML. |
| `contattaci.html` | Form/pagina di contatto per il pubblico. | Testo e (se presente) configurazione del form nell'HTML. |
| `404.html` | Pagina di errore 404 personalizzata. | Testo statico nell'HTML. |
| `test_homepage.html`, `testpage.html` | Pagine di prova/prototipo (non collegate alla navigazione principale). | Sperimentare liberamente; non sono pagine di produzione. |
| `roster/azzurri_niguardese.html`, `roster/mauro_longo.html`, `roster/sporting_pub.html` | Pagine dedicate a squadre/persone specifiche legate al roster. | Testo/immagini statiche nell'HTML corrispondente. |
| `widget/basketball_court.html` | Widget grafico del campo da basket (usato per mostrare shot chart o simili). | Modificare l'SVG/HTML del campo direttamente nel file. |

## Componenti condivisi (header/footer)

`widget/brewers_header.html` e `widget/brewers_footer.html` contengono rispettivamente il menu di navigazione e il footer comuni a (quasi) tutte le pagine. **Ogni pagina li carica a runtime** con una `fetch('https://raw.githubusercontent.com/sverza/Brewers/main/widget/brewers_header.html')` (idem per il footer), quindi:

- Per cambiare voci di menu, logo, social o footer basta modificare questi due file una sola volta: la modifica si riflette automaticamente su tutte le pagine.
- Attenzione: la fetch punta al branch `main` su GitHub, non a un file locale. Le modifiche sono visibili solo **dopo il push su `main`** (non basta salvare il file in locale), e possono richiedere qualche minuto per via della cache di `raw.githubusercontent.com`.
- `ServerCode/brewers_header.js` contiene la logica JS dei menu a tendina (dropdown) usata dall'header.

## Dati (JSON) e come modificarli

La maggior parte dei contenuti "editoriali" (news, partite, roster) non è scritta nell'HTML ma in file JSON, così da poter aggiornare il sito senza toccare codice.

- **Roster** — `roster/brewers_roster.json`: elenco `staff` e `players` (nome, ruolo, immagine, `idpl`/id usato per collegare le statistiche). Aggiungere/rimuovere un giocatore da qui aggiorna automaticamente `roster.html`, `stats.html` e `top_prestazioni.html`.
- **Statistiche giocatore** — `roster/stats/<idpl>.json`: dati anagrafici e statistiche del singolo giocatore/staff (l'`idpl` deve corrispondere a quello in `brewers_roster.json`). Usato da `roster_details.html` e `staff_details.html`.
- **Partite** — `partite/Stagione_AAAA_AA/<data>_<AVVERSARIO>_BREWERS.json`: tabellino statistiche della singola partita (una riga per giocatore: tiri, rimbalzi, assist, punti, ecc.). Per aggiungere una partita basta creare un nuovo file JSON in questo formato dentro la cartella della stagione corretta.
- **Calendario/eventi** — `partite/calendario.json` (partite in programma) e `partite/eventi.json` (altri eventi del club), usati da `calendario.html`, `index.html`, `stats.html`, `top_prestazioni.html`.
- **Articoli/news** — `articoli_per_news/<data>_<titolo>.json`: contenuto di un articolo (`title`, `short_description`, `body`, ecc.), con eventuale immagine associata in `articoli_per_news/images/`. Per pubblicare una news basta aggiungere un nuovo file JSON (+ immagine) qui.
- **Manifest** — `partite/manifest.json` e `articoli_per_news/manifest.json`: elenchi "piatti" generati automaticamente a partire dal contenuto delle cartelle `partite/` e `articoli_per_news/`, usati dalle pagine al posto di interrogare live le API di GitHub (che hanno un limite di 60 richieste/ora e causavano errori "rate limit exceeded"). **Non vanno modificati a mano**: vengono rigenerati da `scripts/build_manifests.py`, eseguito automaticamente dalla GitHub Action descritta sotto ad ogni push che tocca `partite/` o `articoli_per_news/`.

In sintesi: per aggiungere una partita o una news è sufficiente aggiungere il file JSON (ed eventuale immagine) nella cartella giusta e fare push su `main` — il manifest e tutte le pagine collegate si aggiornano da soli.

## Fogli di stile

- `styles.css` — stile globale condiviso.
- `CSS_StyleSheets/homepage_style*.css`, `homepage_globals*.css`, `homepage_styleguide*.css` — stili della home page (versioni desktop e `_mobile`).
- `CSS_StyleSheets/articleview_style.css`, `articleview_styleguide.css` — stili delle pagine articolo.
- `CSS_StyleSheets/BrewersFont.css` — dichiarazione del font custom (`Font/strikefighterlaser.ttf`).
- `roster/styles.css`, `articoli_per_news/styles.css` — stili specifici delle rispettive sezioni.

## Automazioni (GitHub Actions)

`.github/workflows/build-manifests.yml` esegue `scripts/build_manifests.py` automaticamente:

- ad ogni push su `main` che modifica qualcosa dentro `partite/` o `articoli_per_news/` (escludendo i manifest stessi, per evitare loop);
- manualmente, tramite `workflow_dispatch`;
- settimanalmente (`cron: '17 3 * * 1'`) come rete di sicurezza.

Se ci sono differenze, il workflow fa commit automatico dei manifest aggiornati. Questo significa che, dopo aver aggiunto una partita o un articolo, i manifest si aggiornano da soli entro pochi minuti senza bisogno di intervento manuale.

## Altro

- `ServerCode/queryFiles.js` — piccolo server Express (non usato in produzione su GitHub Pages) che espone un endpoint per elencare i file di una cartella per estensione; utile solo per sviluppo/debug locale.
- `Font/` — font custom usato dal sito, con relativa licenza in `Font/readme.txt`.
- `images/`, `roster/images/`, `articoli_per_news/images/` — asset grafici (loghi, foto giocatori, foto articoli, sponsor). Aggiungere immagini qui e referenziarle dal JSON/HTML pertinente.
