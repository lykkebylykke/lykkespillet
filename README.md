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
| `src/ui.js` | HUD, faner, mål, notifikationer |
