# Rut Score — rutscore.com

How hot is the rut, and will deer move today? A Rut Score and a 1–10 Hunt Score for your own hunting land, the best time to hunt,
which stand fits the wind, legal shooting light, the rut, and the 7-day outlook.

| Folder / file | What it does |
|---|---|
| `public/` | The app: page, styles, scoring engine, icons, preview images, offline worker |
| `public/engine.js` | The Hunt Score and Rut Score recipes, stand wind check, coordinate reader and property share codes |
| `netlify/edge-functions/preview.js` | Personalized link previews for shared forecasts |
| `netlify/functions/alerts.mjs` | Turns hunt alerts on and off (`/api/alerts`) |
| `netlify/functions/alerts-daily.mjs` | Checks every alert each afternoon and sends notifications |
| `netlify.toml`, `package.json` | Netlify settings. Nothing to change |

Properties and stands are saved on each person's phone. Nothing about anyone's land is stored on the server,
except the location of a property someone turns alerts on for.

## Data and map sources
- Weather: Open-Meteo (free for non-commercial use; get their commercial plan before adding ads or charging)
- Satellite imagery: Esri World Imagery. Street map: OpenStreetMap tiles (fair-use policy, attribution required).
  If traffic grows, switch to a keyed provider such as MapTiler or Mapbox.
- Place search: Photon (OpenStreetMap)
