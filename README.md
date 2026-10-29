# LykkeSpillet

Vertikalt webshop-managementspil (MVP) bygget med Three.js + Vite.

```bash
npm install
npm run dev      # http://localhost:5173 (også på dit netværk – åbn på mobilen)
npm run build    # statisk build i dist/
```

Styring: træk hvor som helst på skærmen (joystick) eller brug WASD/piletaster. Stil dig ved en station for at udføre handlingen.

| Fil | Indhold |
| --- | --- |
| `src/data.js` | Al balancering: produkter, roller, upgrades, mål, layout |
| `src/state.js` | Spiltilstand, gem/indlæs (localStorage), fælles handlinger |
| `src/sim.js` | Trafik, ordrer, leverancer, dage, events, flaskehals-rådgiver |
| `src/world.js` | 3D-scene, stationer, labels, pathfinding |
| `src/actors.js` | Spiller, medarbejder-AI (generator-baseret) |
| `src/build.js` | Indretning: placér, flyt og drej møbler |
| `src/creator.js` | Opret din chef: navn, køn, udseende og tøj ved nyt spil |
| `src/ui.js` | HUD, faner, mål, notifikationer |
| `src/cloud.js` | Login og gem i skyen (kun når spillet kører via serveren) |
| `server/index.js` | Lille Node-server: serverer spillet + API til brugere og gemte spil |

## Login og gem i skyen (Sliplane)

På GitHub Pages gemmes spillet kun i browseren. Kører spillet via `server/index.js`, skal man logge ind, og spillet gemmes på serveren, så man kan spille videre fra andre enheder.

Lokalt:

```bash
npm run build
node server/index.js          # http://localhost:3000 – data i ./data
```

På Sliplane:

1. Opret en service fra GitHub-repoet `lykkebylykke/lykkespillet` (deploy-metode: **Dockerfile**, branch `main`).
2. Tilføj en **volume** monteret på `/data` – her ligger brugere, sessioner og gemte spil. Uden volume forsvinder alt ved næste deploy.
3. Port: `3000` (sættes også via `PORT`). Sliplane giver HTTPS-domænet.
4. Hver push til `main` bygger og deployer automatisk.

API: `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/me`, `GET|PUT|DELETE /api/save`. Koder gemmes som scrypt-hash; login-cookien er HttpOnly. Åbner man spillet på en ny enhed, overtager den gemmet, og en ældre fane, der stadig er åben, stopper i stedet for at overskrive.
