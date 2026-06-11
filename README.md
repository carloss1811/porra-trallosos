# 🏆 Porra Trallosa — Mundial 2026

La porra del Mundial 2026 de los trallosos: clasificación en vivo, resultados,
predicciones y reparto del bote, todo automático.

**Web:** https://carloss1811.github.io/porra-trallosos/

## Cómo funciona

```
Google Form ──> Hoja de respuestas ──┐
                                     ├──> GitHub Action (cada 10 min)
football-data.org (resultados) ──────┘         │
                                               ▼
                                   scripts/update_data.py
                                               │
                                               ▼
                                        data/*.json ──> GitHub Pages (web)
```

- `crear_formulario.gs` — script de Google Apps Script que crea el formulario
  de la porra y su hoja de respuestas (se ejecuta una vez en script.google.com).
- `scripts/update_data.py` — descarga los resultados del Mundial, lee las
  respuestas y calcula las puntuaciones según las reglas de la porra.
- `.github/workflows/update-data.yml` — lo ejecuta cada 10 minutos y hace
  commit de los JSON si algo cambió.
- `index.html` + `assets/` — la web (GitHub Pages), que se refresca sola cada
  minuto en el navegador.

## Puesta en marcha (una sola vez)

1. **Secrets** (Settings → Secrets and variables → Actions):
   - `FOOTBALL_DATA_TOKEN`: API key de [football-data.org](https://www.football-data.org/).
   - `SHEET_CSV_URL` *(opcional)*: URL de la hoja de respuestas de Google.
     También puede ponerse en `data/config.json` → `sheet_csv_url`.
     La hoja debe compartirse como **"Cualquier persona con el enlace: Lector"**.
2. **GitHub Pages**: Settings → Pages → Source: *Deploy from a branch* →
   `main` / `/ (root)`.
3. **Primera ejecución**: pestaña Actions → "Actualizar datos de la porra" →
   *Run workflow*.

## Configuración

- `data/config.json`:
  - `aportacion_eur`: lo que pone cada tralloso. El bote se calcula solo
    (participantes × aportación).
  - `sheet_csv_url`: hoja de respuestas. Mientras esté vacía, la web funciona
    en **modo demo** con `data/respuestas_ejemplo.csv`.
  - `enforce_deadline`: descarta respuestas enviadas tras el inicio del Mundial.
- `data/overrides.json`: datos que la API gratuita no da y se apuntan a mano
  cuando ocurren (primer goleador de España, máximo goleador de España,
  tarjeta roja en la final, minuto del primer gol de la final).

## Notas de cálculo

- Los puntos solo se consolidan cuando una pregunta queda **decidida** (un
  grupo termina, una ronda se completa, etc.). La columna "Máx" muestra lo que
  cada uno puede llegar a sumar todavía.
- Con partidos en juego, la pestaña **En vivo** muestra un ranking provisional
  recalculado como si los partidos acabaran con el marcador actual.
- Desempates implementados en el orden de las reglas: campeón → subcampeón →
  semifinalistas → cuartofinalistas → España → minuto del primer gol. Si aun
  así hay empate, comparten posición y premio.
- El orden de los grupos usa puntos → diferencia de goles → goles a favor
  (si la FIFA aplica un desempate más fino en algún grupo, se puede corregir
  el resultado a mano en un override).
