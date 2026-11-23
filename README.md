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
- Tegelikud hinnad, mitte demoandmed. Puuduvate hindade korral on graafikul tühi
  olek; laadimisvea jaoks on eraldi teade.

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

Töövoog käivitub ajastatult kaks korda päevas Eesti aja järgi:

- kell 14:15;
- kell 15:00.

Ajastus kasutab `Europe/Tallinn` ajavööndit ning arvestab suve- ja talveajaga.
Lisaks käivitub töövoog automaatselt muudatuste saatmisel `main`-harusse, et uus
kood jõuaks veebi. Käsitsi saab selle käivitada Actionsi lehel nupuga **Run workflow**.
Graafikud kasutavad alati Eesti aega. Homsel graafikul kuvatakse ka ainult
osaliselt avaldatud hinnad, alustades homsest keskööst; kindlat avaldamiskellaaega ei eeldata.
GitHub Actionsi ajastused võivad hilineda. Ajastatud töövoog peab olema
vaikimisi harus ning avalikus repositooriumis võib GitHub selle pika
tegevusetuse järel peatada. Vajadusel lülita see Actionsi lehel uuesti sisse.
Pärast keskööd puuduvad uue homse päeva hinnad järgmise eduka avaldamiseni.
Kui mõlemal käivitusel jäävad homsed hinnad saamata, puuduvad pärast keskööd
ka tänased hinnad kuni järgmise eduka uuenduseni.

Kui homne päev on ainult osaliselt saadaval, lisatakse olemasolevad veerandtunnid
hinnafaili. Osaline päev peab algama keskööst ja hinnapunktides ei tohi olla lünki.
Graafiku ajatelg hõlmab alati kogu päeva; avaldamata tundide ala jääb tühjaks.
Kellakeeramise päevadel arvestab ajatelg päeva tegeliku 23- või 25-tunnise pikkusega.
Järgmised uuendused proovivad homseid hindu uuesti.
Uuendus ebaõnnestub, kui tänane päev on puudulik, päev sisaldab vigaseid hindu
või ajatempleid või API tagastab vea. Sel juhul ei alustata uut avaldamist ning eelmine
veebileht jääb alles. Hinnafaili vanuse ega tänaste hindade puudumise kohta eraldi
hoiatust ei kuvata. Puuduvate hindade korral on graafik tühi; eilseid hindu ei
kuvata tänaste pähe. Laadimisvea teade jääb alles.

## Tasud ja arvutus

Kõik sisemised hinnakomponendid on **senti/kWh ilma käibemaksuta**.
Eleringi EUR/MWh jagatakse kümnega. Käibemaks lisatakse komponentide summale
ühe korra; ümardamine toimub alles kuvamisel.

Vaikimisi on valitud Võrk 2 ning müüja marginaal **0** — sisesta oma lepingus olev
marginaal ilma käibemaksuta. Tasakaalustamisvõimsuse kulu on eraldi komponent:
kontrolli, et sa ei lisaks seda marginaali sisestamisel teist korda.
Päeva keskmine on võrdse pikkusega perioodide ajakeskmine, mitte sinu tarbimisega
kaalutud hind. Osalise päeva puhul arvutatakse keskmine ainult kuvatud perioodidest
ning graafiku juures on märge „Osaline päev”.
Tunnirežiimis keskmistatakse neli veerandtunni lõpphinda; pooleliolevat tundi ei kuvata.

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


