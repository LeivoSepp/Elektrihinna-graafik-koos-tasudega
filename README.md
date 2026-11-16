# Elektrihinna graafik

Staatiline eestikeelne veebileht tänase ja homse elektri lõpphinna vaatamiseks.

## Omadused

- Eleringi Eesti piirkonna 15 minuti börsihinnad; soovi korral tunni keskmised.
- Elektrilevi Võrk 1, 2, 4 ja 5 koos päeva-, öö- ja talviste tiputariifidega.
- Eesti ajavöönd, riiklikud pühad ja 23/25-tunnised kellakeeramise päevad.
- Börsihind + võrgutasu + müüja marginaal + taastuvenergia tasu + aktsiis +
  varustuskindluse tasu + tasakaalustamisvõimsuse kulu + käibemaks.
- **Kuutasud ja muud tarbimismahust sõltumatud tasud on välja jäetud.**
- Seaded brauseri localStorage'is, klaviatuuriga kasutatav graafik ja hinnatabel.
- Tegelikud hinnad, mitte demoandmed. Avaldamata homsete hindade, laadimisvea ja
  aegunud hinnafaili jaoks on eraldi teated.

## Kohalik käivitamine

Vajalik on **Node.js 22 või uuem**, millega tuleb kaasa npm. Lisapakette pole vaja
paigaldada.

```powershell
npm run update-prices
npm run dev
```

Ava brauseris `http://127.0.0.1:4173`. Hinnad laaditakse käivituseelse käsuga
faili `site/data/prices.json`; arendusserver ise Eleringi päringuid ei tee.
Uute börsihindade saamiseks käivita `npm run update-prices` uuesti.
Veebileht kontrollib kohalikku hinnafaili iga viie minuti järel ning brauseriaknasse
naasmisel. Lehe nupp „Värskenda” loeb samuti hinnafaili, mitte Eleringi API-t.

```powershell
npm test
npm run build
```

Avaldamisvalmis failid tekivad kataloogi `dist`. Build nõuab olemasolevat,
valideeritud hinnafaili. Andmefail on genereeritav ega kuulu lähtekoodi.
Testid ei vaja võrguühendust.

## Azure Static Web Apps ja GitHub Actions

Eleringi API CORS-piirangu vältimiseks laadib hindu **GitHub Actions**, mitte brauser.
Hinnafail ja veebileht avaldatakse koos samale domeenile. Ühtegi Azure Functionit
ega muud taustateenust ei kasutata.

1. Paigalda see projekt GitHubi repositooriumi juurkausta, vaikimisi harusse `main`.
2. Loo Azure'is **Static Web App**. Vali käsitsi hallatav avaldamine / `Other`, sest
   projektis on töövoog juba olemas. Eraldi API-d pole.
3. Kopeeri Azure'i rakenduse **deployment token** GitHubi repositooriumi
   **Settings → Secrets and variables → Actions** alla saladuseks nimega
   `AZURE_STATIC_WEB_APPS_API_TOKEN`. Ära kirjuta tokenit lähtekoodi.
4. Käivita GitHubi **Actions → Update prices and publish → Run workflow**.
   Töövoog käivitab testid, laadib hinnad, koostab `dist`-kausta ja avaldab selle Azure'is.

Töövoog käivitub ka `main`-haru muudatustel ning ajastatult:

- UTC 10–16 iga 15 minuti järel, minutil 7, 22, 37 ja 52;
- muul ajal kord tunnis, minutil 7.

UTC 10–16 tähendab Eestis talvel 12–18 ja suvel 13–19.
Graafikud kasutavad alati Eesti aega. Homseid hindu näidatakse alles siis,
kui saadaval on kogu homne päev; kindlat avaldamiskellaaega ei eeldata.
GitHub Actionsi ajastused võivad hilineda. Ajastatud töövoog peab olema
vaikimisi harus ning avalikus repositooriumis võib GitHub selle pika
tegevusetuse järel peatada. Vajadusel lülita see Actionsi lehel uuesti sisse.
Pärast keskööd võib järgmise eduka avaldamiseni tekkida lühike homsete
hindade puudumise periood.

Uuendus ebaõnnestub, kui tänane päev on puudulik, homne päev on ainult osaliselt
saadaval või API tagastab vea. Sel juhul ei alustata uut avaldamist ning eelmine
veebileht jääb alles. Brauser näitab üle kahe tunni vanuse hinnafaili kohta hoiatust
ega kuva eilseid hindu tänaste pähe.

## Tasud ja arvutus

Kõik sisemised hinnakomponendid on **senti/kWh ilma käibemaksuta**.
Eleringi EUR/MWh jagatakse kümnega. Käibemaks lisatakse komponentide summale
ühe korra; ümardamine toimub alles kuvamisel.

Vaikimisi on valitud Võrk 2 ning müüja marginaal **0** — sisesta oma lepingus olev
marginaal ilma käibemaksuta. Tasakaalustamisvõimsuse kulu on eraldi komponent:
kontrolli, et sa ei lisaks seda marginaali sisestamisel teist korda.
Päeva keskmine on võrdse pikkusega perioodide ajakeskmine, mitte sinu tarbimisega
kaalutud hind. Tunnirežiimis keskmistatakse neli veerandtunni lõpphinda.

Algsed tasud on 2026. aasta kodutarbija määrad:

| Tasu | Senti/kWh km-ta |
| --- | ---: |
| Taastuvenergia | 0,84 |
| Elektriaktsiis | 0,21 |
| Varustuskindlus | 0,758 |
| Tasakaalustamisvõimsus | 0,373 |

Käibemaks on 24%. Võrgutariifid asuvad failis `site/src/pricing.js`.
Riiklikke tasusid, käibemaksu ja marginaali saab muuta lehe seadetes.
Uue aasta saabumisel kuvatakse tariifide kontrollimise hoiatus; tasud ega
võrgutariifid ei uuene automaatselt. Salvestatud kasutajaseadeid ei kirjutata
rakenduse avaldamisel üle.

Põhiallikad:

- [Elektrilevi paketid ja tariifide kellaajad](https://elektrilevi.ee/et/vorguleping/vorgupaketid/eramu)
- [Elektrilevi kehtiv hinnakiri](https://public-docs.elektrilevi.ee/2/7/vorguteenuse_kehtiv_hinnakiri_71ed51b53d.pdf)
- [Eleringi taastuvenergia tasu 2026](https://elering.ee/artikkel/taastuvenergia-tasu-jargmisel-aastal-ei-muutu)
- [Eleringi varustuskindluse tasu](https://elering.ee/varustuskindluse-tasu)
- [Eleringi tasakaalustamisvõimsuse kulu](https://elering.ee/tasakaalustamisvoimsuse-kulu)
- [Maksu- ja Tolliameti aktsiisiinfo](https://www.emta.ee/ariklient/maksud-ja-tasumine/aktsiisid)
- [Eleringi hinnapäring](https://dashboard.elering.ee/api/nps/price)


