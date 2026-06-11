#!/usr/bin/env python3
"""
Porra Trallosa — actualizador de datos.

Descarga resultados del Mundial 2026 (football-data.org), lee las respuestas
de la porra (hoja de Google o CSV local) y calcula las puntuaciones según las
reglas de la porra. Genera en data/:

  - matches.json      partidos, tablas de grupos y cuadro de eliminatorias
  - predictions.json  respuestas limpias de cada tralloso
  - standings.json    clasificación oficial + clasificación provisional en vivo
  - history.json      evolución de puntos (para la gráfica)

Se ejecuta desde GitHub Actions cada pocos minutos. Variables de entorno:
  FOOTBALL_DATA_TOKEN  (obligatoria) API key de football-data.org
  SHEET_CSV_URL        (opcional) URL de la hoja de respuestas; si no,
                       se usa config.json -> sheet_csv_url, y como último
                       recurso data/respuestas_ejemplo.csv (modo demo).
"""

import csv
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

API = "https://api.football-data.org/v4"

TOURNAMENT = json.loads((DATA / "tournament.json").read_text(encoding="utf-8"))
CONFIG = json.loads((DATA / "config.json").read_text(encoding="utf-8"))
OVERRIDES = json.loads((DATA / "overrides.json").read_text(encoding="utf-8"))

TEAMS_BY_ID = {int(k): v for k, v in TOURNAMENT["teams"].items()}
GRUPOS = TOURNAMENT["grupos"]
FAVORITAS = set(TOURNAMENT["favoritas"])
RONDAS = TOURNAMENT["rondas"]  # índice 0..6: grupos..campeón

STAGE_ROUND = {
    "GROUP_STAGE": 0,
    "LAST_32": 1,
    "LAST_16": 2,
    "QUARTER_FINALS": 3,
    "SEMI_FINALS": 4,
    "THIRD_PLACE": 4,
    "FINAL": 5,
}

FINISHED = {"FINISHED", "AWARDED"}
LIVE = {"IN_PLAY", "PAUSED"}


# ------------------------------------------------------------- utilidades

def norm(s):
    """minúsculas y sin acentos, para comparar nombres."""
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def same_player(prediccion, real):
    """True si la predicción nombra al mismo jugador (admite solo apellido)."""
    a, b = norm(prediccion), norm(real)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    # al menos una palabra de >=4 letras en común (apellidos)
    pa = {w for w in a.split() if len(w) >= 4}
    pb = {w for w in b.split() if len(w) >= 4}
    return bool(pa & pb)


def player_in(prediccion, lista):
    return any(same_player(prediccion, real) for real in lista)


def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def api_get(path):
    token = os.environ.get("FOOTBALL_DATA_TOKEN", "")
    if not token:
        sys.exit("Falta FOOTBALL_DATA_TOKEN")
    return json.loads(http_get(API + path, {"X-Auth-Token": token}))


def team_es(t):
    """Nombre en español de un equipo de la API (o None si aún sin definir)."""
    if not t or not t.get("id"):
        return None
    return TEAMS_BY_ID.get(t["id"], t.get("name"))


# ------------------------------------------------------------- respuestas

def sheet_csv_url():
    url = os.environ.get("SHEET_CSV_URL") or CONFIG.get("sheet_csv_url") or ""
    m = re.search(r"docs\.google\.com/spreadsheets/d/([\w-]+)", url)
    if m:
        return f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv"
    return url


def load_responses():
    """Devuelve (filas, demo). Cada fila es un dict cabecera->valor."""
    url = sheet_csv_url()
    if url:
        try:
            raw = http_get(url).decode("utf-8-sig")
            rows = list(csv.DictReader(io.StringIO(raw)))
            if rows:
                return rows, False
            print("Aviso: la hoja está vacía, uso datos de ejemplo")
        except Exception as e:  # noqa: BLE001 - seguimos con el fallback
            print(f"Aviso: no pude leer la hoja ({e}), uso datos de ejemplo")
    ejemplo = DATA / "respuestas_ejemplo.csv"
    if ejemplo.exists():
        with ejemplo.open(encoding="utf-8") as f:
            return list(csv.DictReader(f)), True
    return [], True


def parse_ts(s, mdy=False):
    """Fecha de Google Sheets. mdy=True si la hoja está en locale inglés
    (cabecera 'Timestamp'), que exporta mes/día/año."""
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?", (s or "").strip())
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    month, day = (a, b) if mdy else (b, a)
    if month > 12:  # el formato asumido no puede ser: los intercambiamos
        month, day = day, month
    try:
        tz = ZoneInfo(CONFIG.get("sheet_timezone", "Europe/Madrid"))
        return datetime(int(m.group(3)), month, day, int(m.group(4)),
                        int(m.group(5)), int(m.group(6) or 0), tzinfo=tz)
    except ValueError:
        return None


def parse_predictions(rows):
    """Convierte las filas del CSV en predicciones limpias por persona."""
    deadline = datetime.fromisoformat(CONFIG["deadline_utc"].replace("Z", "+00:00"))
    people = {}
    for row in rows:
        p = {"grupos": {}}
        ts = None
        for header, value in row.items():
            if header is None:
                continue
            h = header.strip()
            v = (value or "").strip()
            if norm(h).startswith(("marca temporal", "timestamp")):
                ts = parse_ts(v, mdy=norm(h).startswith("timestamp"))
            elif norm(h) == "nombre":
                p["nombre"] = v
            elif m := re.match(r"^Grupo ([A-L]) [—-] (1|2)º", h):
                p["grupos"].setdefault(m.group(1), {})[m.group(2)] = v
            elif m := re.match(r"^(\d+)\.", h):
                p[f"q{m.group(1)}"] = v
        if not p.get("nombre"):
            continue
        if CONFIG.get("enforce_deadline") and ts and ts > deadline:
            print(f"Descartada respuesta fuera de plazo: {p['nombre']} ({ts})")
            continue
        p["q3"] = [x.strip() for x in p.get("q3", "").split(",") if x.strip()]
        p["q4"] = [x.strip() for x in p.get("q4", "").split(",") if x.strip()]
        people[norm(p["nombre"])] = p  # la última respuesta en plazo manda
    return list(people.values())


def parse_final_score(text):
    """'España 2-1 Francia' -> ({'España': 2, 'Francia': 1}) o None."""
    m = re.match(r"^\s*(.+?)\s+(\d+)\s*[-–]\s*(\d+)\s+(.+?)\s*$", text or "")
    if not m:
        return None
    return {m.group(1).strip(): int(m.group(2)), m.group(4).strip(): int(m.group(3))}


def parse_minute(text):
    t = norm(text)
    if not t:
        return None, False
    if "no" in t and "gol" in t:
        return None, True  # predijo que no hay gol
    m = re.search(r"\d+", t)
    return (int(m.group()) if m else None), False


# ------------------------------------------------------- estado del torneo

def simplify_match(m, live_mode=False):
    """Normaliza un partido de la API. En live_mode los partidos en juego
    cuentan como acabados con el marcador actual."""
    status = m["status"]
    finished = status in FINISHED or (live_mode and status in LIVE)
    ft = m["score"]["fullTime"]
    winner_code = m["score"].get("winner")
    home, away = team_es(m["homeTeam"]), team_es(m["awayTeam"])
    winner = None
    if finished:
        if winner_code == "HOME_TEAM":
            winner = home
        elif winner_code == "AWAY_TEAM":
            winner = away
        elif status in LIVE and ft["home"] is not None and ft["home"] != ft["away"]:
            winner = home if ft["home"] > ft["away"] else away
    return {
        "id": m["id"],
        "stage": m["stage"],
        "group": (m.get("group") or "")[-1:] if m.get("group") else None,
        "utc": m["utcDate"],
        "status": status,
        "minute": m.get("minute"),
        "home": home,
        "away": away,
        "home_crest": m["homeTeam"].get("crest"),
        "away_crest": m["awayTeam"].get("crest"),
        "gh": ft["home"],
        "ga": ft["away"],
        "duration": m["score"].get("duration", "REGULAR"),
        "penalties": m["score"].get("penalties"),
        "finished": finished,
        "live": status in LIVE,
        "winner": winner,
    }


def group_table(matches, letra):
    stats = {t: dict(equipo=t, pts=0, pj=0, g=0, e=0, p=0, gf=0, gc=0) for t in GRUPOS[letra]}
    done = 0
    for m in matches:
        if m["stage"] != "GROUP_STAGE" or m["group"] != letra:
            continue
        if not (m["finished"] and m["gh"] is not None):
            continue
        done += 1
        h, a = stats.get(m["home"]), stats.get(m["away"])
        if not h or not a:
            continue
        h["pj"] += 1; a["pj"] += 1
        h["gf"] += m["gh"]; h["gc"] += m["ga"]
        a["gf"] += m["ga"]; a["gc"] += m["gh"]
        if m["gh"] > m["ga"]:
            h["g"] += 1; h["pts"] += 3; a["p"] += 1
        elif m["gh"] < m["ga"]:
            a["g"] += 1; a["pts"] += 3; h["p"] += 1
        else:
            h["e"] += 1; a["e"] += 1; h["pts"] += 1; a["pts"] += 1
    order = sorted(stats.values(),
                   key=lambda s: (-s["pts"], -(s["gf"] - s["gc"]), -s["gf"], s["equipo"]))
    for s in order:
        s["dg"] = s["gf"] - s["gc"]
    return order, done == 6


def tournament_state(raw_matches, scorers, live_mode=False):
    """Calcula todo lo que hace falta para puntuar la porra."""
    matches = [simplify_match(m, live_mode) for m in raw_matches]

    tables = {}
    groups_done = {}
    for letra in GRUPOS:
        tables[letra], groups_done[letra] = group_table(matches, letra)

    # hasta dónde llega cada equipo (índice de RONDAS)
    reached = {t: 0 for ts in GRUPOS.values() for t in ts}
    eliminated = {}
    ko = [m for m in matches if m["stage"] in STAGE_ROUND and m["stage"] not in ("GROUP_STAGE", "THIRD_PLACE")]
    for m in ko:
        idx = STAGE_ROUND[m["stage"]]
        for t in (m["home"], m["away"]):
            if t:
                reached[t] = max(reached.get(t, 0), idx)
        if m["finished"] and m["winner"]:
            loser = m["away"] if m["winner"] == m["home"] else m["home"]
            if loser:
                eliminated[loser] = True
            if m["stage"] == "FINAL":
                reached[m["winner"]] = 6
                eliminated[m["winner"]] = True

    # eliminados en fase de grupos: cuando los 32 clasificados son conocidos
    r32 = [m for m in matches if m["stage"] == "LAST_32"]
    r32_known = r32 and all(m["home"] and m["away"] for m in r32)
    if r32_known:
        clasificados = {t for m in r32 for t in (m["home"], m["away"])}
        for t in reached:
            if t not in clasificados:
                eliminated[t] = True

    tournament_over = all(m["finished"] for m in matches)

    # España
    esp_matches = [m for m in matches if "España" in (m["home"], m["away"]) and m["finished"] and m["gh"] is not None]
    esp_goles = sum((m["gh"] if m["home"] == "España" else m["ga"]) for m in esp_matches)
    esp_done = eliminated.get("España", False) or tournament_over

    final = next((m for m in matches if m["stage"] == "FINAL"), None)
    final_done = bool(final and final["finished"] and final["winner"])

    campeon = final["winner"] if final_done else None
    subcampeon = None
    if final_done:
        subcampeon = final["away"] if campeon == final["home"] else final["home"]

    semifinalistas = {t for t, r in reached.items() if r >= 4}
    cuartofinalistas = {t for t, r in reached.items() if r >= 3}

    # pichichi (de la API; admite empates) con posible override
    pichichi, max_goals = [], 0
    for s in scorers:
        if s["goals"] > max_goals:
            max_goals, pichichi = s["goals"], [s["player"]]
        elif s["goals"] == max_goals and max_goals > 0:
            pichichi.append(s["player"])
    if OVERRIDES.get("maximo_goleador_mundial"):
        pichichi = [x.strip() for x in OVERRIDES["maximo_goleador_mundial"].split(",")]

    goleadores_esp = [s["player"] for s in scorers if s["team"] == "España"]
    max_gol_esp = None
    if OVERRIDES.get("maximo_goleador_espana"):
        max_gol_esp = [x.strip() for x in OVERRIDES["maximo_goleador_espana"].split(",")]
    elif goleadores_esp and (esp_done or tournament_over):
        max_gol_esp = [goleadores_esp[0]]  # la lista de la API viene ordenada

    # revelación: no favorita que más lejos llega
    no_fav = [t for t in reached if t not in FAVORITAS]
    max_no_fav = max(reached[t] for t in no_fav)
    revelacion = {t for t in no_fav if reached[t] == max_no_fav}
    rev_decidida = tournament_over or all(eliminated.get(t) for t in no_fav)

    # decepción: favorita que antes cae
    fav_elim = {t: reached[t] for t in FAVORITAS if eliminated.get(t)}
    decepcion, dec_decidida = set(), False
    if fav_elim:
        peor = min(fav_elim.values())
        decepcion = {t for t, r in fav_elim.items() if r == peor}
        vivos = [t for t in FAVORITAS if not eliminated.get(t)]
        dec_decidida = tournament_over or all(reached[t] > peor for t in vivos)

    return {
        "matches": matches,
        "tables": tables,
        "groups_done": groups_done,
        "reached": reached,
        "eliminated": eliminated,
        "tournament_over": tournament_over,
        "campeon": campeon,
        "subcampeon": subcampeon,
        "semifinalistas": semifinalistas,
        "cuartofinalistas": cuartofinalistas,
        "pichichi": pichichi,
        "pichichi_decidido": tournament_over,
        "max_gol_esp": max_gol_esp,
        "esp_goles": esp_goles,
        "esp_done": esp_done,
        "esp_reached": reached["España"],
        "esp_gana_grupo": tables["H"][0]["equipo"] == "España" if groups_done["H"] else None,
        "revelacion": revelacion,
        "rev_decidida": rev_decidida,
        "decepcion": decepcion,
        "dec_decidida": dec_decidida,
        "final": final,
        "final_done": final_done,
    }


# ------------------------------------------------------------- puntuación

def q(num, titulo, respuesta, estado, puntos, maximo, nota=""):
    return {"q": num, "titulo": titulo, "respuesta": respuesta,
            "estado": estado, "puntos": puntos, "max": maximo, "nota": nota}


def score_person(p, st):
    """Puntúa todas las preguntas de una persona contra el estado del torneo."""
    items = []

    def decidida(cond_acierto, pts):
        return ("acertado", pts) if cond_acierto else ("fallado", 0)

    # 1-2 campeón y subcampeón
    for num, titulo, pred, actual, pts in (
        (1, "Campeón", p.get("q1", ""), st["campeon"], 25),
        (2, "Subcampeón", p.get("q2", ""), st["subcampeon"], 18),
    ):
        if st["final_done"]:
            estado, puntos = decidida(pred == actual, pts)
        elif pred in st["eliminated"] and st["eliminated"].get(pred) and st["reached"].get(pred, 0) < (6 if num == 1 else 5):
            estado, puntos = "fallado", 0
        else:
            estado, puntos = "pendiente", 0
        items.append(q(num, titulo, pred, estado, puntos, pts))

    # 3 semifinalistas (6 por acierto)
    pts = sum(6 for t in p.get("q3", []) if t in st["semifinalistas"])
    vivos = [t for t in p.get("q3", []) if t not in st["semifinalistas"] and not st["eliminated"].get(t)]
    estado = "pendiente" if (vivos and len(st["semifinalistas"]) < 4) else \
             ("acertado" if pts else "fallado")
    items.append(q(3, "Semifinalistas", ", ".join(p.get("q3", [])), estado, pts, 24,
                   f"{pts // 6}/4 acertados"))

    # 4 cuartofinalistas (3 por acierto)
    pts = sum(3 for t in p.get("q4", []) if t in st["cuartofinalistas"])
    vivos = [t for t in p.get("q4", []) if t not in st["cuartofinalistas"] and not st["eliminated"].get(t)]
    estado = "pendiente" if (vivos and len(st["cuartofinalistas"]) < 8) else \
             ("acertado" if pts else "fallado")
    items.append(q(4, "Cuartofinalistas", ", ".join(p.get("q4", [])), estado, pts, 24,
                   f"{pts // 3}/8 acertados"))

    # 5 pichichi
    if st["pichichi_decidido"] and st["pichichi"]:
        estado, puntos = decidida(player_in(p.get("q5", ""), st["pichichi"]), 10)
    else:
        estado, puntos = "pendiente", 0
    items.append(q(5, "Máximo goleador del Mundial", p.get("q5", ""), estado, puntos, 10))

    # 6 revelación
    if st["rev_decidida"]:
        estado, puntos = decidida(p.get("q6", "") in st["revelacion"], 8)
    else:
        estado, puntos = "pendiente", 0
    items.append(q(6, "Equipo revelación", p.get("q6", ""), estado, puntos, 8))

    # 7 decepción
    if st["dec_decidida"]:
        estado, puntos = decidida(p.get("q7", "") in st["decepcion"], 8)
    else:
        estado, puntos = "pendiente", 0
    items.append(q(7, "Equipo decepción", p.get("q7", ""), estado, puntos, 8))

    # 8 hasta dónde llega España
    esp_dist = None
    if st["esp_done"]:
        actual = RONDAS[st["esp_reached"]]
        pred_idx = RONDAS.index(p.get("q8")) if p.get("q8") in RONDAS else -99
        esp_dist = abs(pred_idx - st["esp_reached"])
        estado, puntos = decidida(p.get("q8", "") == actual, 12)
        nota = f"España: {actual}"
    else:
        estado, puntos, nota = "pendiente", 0, ""
        pred_idx = RONDAS.index(p.get("q8")) if p.get("q8") in RONDAS else -99
        if pred_idx < st["esp_reached"]:  # ya ha llegado más lejos de lo predicho
            estado = "fallado"
            esp_dist = None
    items.append(q(8, "¿Hasta dónde llega España?", p.get("q8", ""), estado, puntos, 12, nota))

    # 9 España gana su grupo
    if st["esp_gana_grupo"] is None:
        estado, puntos = "pendiente", 0
    else:
        gana = "Sí" if st["esp_gana_grupo"] else "No"
        estado, puntos = decidida(norm(p.get("q9", "")) == norm(gana), 5)
    items.append(q(9, "¿España gana su grupo?", p.get("q9", ""), estado, puntos, 5))

    # 10 máximo goleador de España
    if st["max_gol_esp"]:
        estado, puntos = decidida(player_in(p.get("q10", ""), st["max_gol_esp"]), 8)
    else:
        estado, puntos = "pendiente", 0
    items.append(q(10, "Máximo goleador de España", p.get("q10", ""), estado, puntos, 8))

    # 11 goles totales de España (exacto 10 / ±1 5)
    if st["esp_done"]:
        try:
            pred = int(re.search(r"\d+", p.get("q11", "")).group())
        except AttributeError:
            pred = -99
        diff = abs(pred - st["esp_goles"])
        puntos = 10 if diff == 0 else (5 if diff == 1 else 0)
        estado = "acertado" if puntos else "fallado"
        nota = f"España marcó {st['esp_goles']}"
    else:
        estado, puntos, nota = "pendiente", 0, f"lleva {st['esp_goles']}"
    items.append(q(11, "Goles totales de España", p.get("q11", ""), estado, puntos, 10, nota))

    # 12 primer goleador de España
    primer = OVERRIDES.get("primer_goleador_espana")
    if primer:
        estado, puntos = decidida(same_player(p.get("q12", ""), primer), 8)
    else:
        estado, puntos = "pendiente", 0
    items.append(q(12, "Primer goleador de España", p.get("q12", ""), estado, puntos, 8))

    # fase de grupos
    grupos_pts = 0
    for letra in GRUPOS:
        pred = p["grupos"].get(letra, {})
        p1, p2 = pred.get("1", ""), pred.get("2", "")
        if not st["groups_done"][letra]:
            items.append(q(f"G{letra}", f"Grupo {letra}", f"1º {p1} · 2º {p2}", "pendiente", 0, 7))
            continue
        real1, real2 = st["tables"][letra][0]["equipo"], st["tables"][letra][1]["equipo"]
        pts = 0
        pts += 4 if p1 == real1 else (2 if p1 == real2 else 0)
        pts += 3 if p2 == real2 else (2 if p2 == real1 else 0)
        grupos_pts += pts
        items.append(q(f"G{letra}", f"Grupo {letra}", f"1º {p1} · 2º {p2}",
                       "acertado" if pts else "fallado", pts, 7,
                       f"real: 1º {real1} · 2º {real2}"))

    # 13-14 resultado exacto y ganador de la final
    exacto = False
    if st["final_done"]:
        f = st["final"]
        real = {f["home"]: f["gh"], f["away"]: f["ga"]}
        pred = parse_final_score(p.get("q13", ""))
        exacto = pred == real
        estado, puntos = decidida(exacto, 12)
    else:
        estado, puntos = "pendiente", 0
    items.append(q(13, "Resultado exacto de la final", p.get("q13", ""), estado, puntos, 12))

    if st["final_done"]:
        acierto = p.get("q14", "") == st["campeon"] and not exacto
        estado, puntos = decidida(acierto, 5)
        nota = "incluido en el resultado exacto" if exacto and p.get("q14") == st["campeon"] else ""
    else:
        estado, puntos, nota = "pendiente", 0, ""
    items.append(q(14, "Ganador de la final", p.get("q14", ""), estado, puntos, 5, nota))

    # 15 penaltis en la final
    if st["final_done"]:
        hubo = st["final"]["duration"] == "PENALTY_SHOOTOUT"
        estado, puntos = decidida(norm(p.get("q15", "")) == norm("Sí" if hubo else "No"), 5)
    else:
        estado, puntos = "pendiente", 0
    items.append(q(15, "¿Penaltis en la final?", p.get("q15", ""), estado, puntos, 5))

    # 16 tarjeta roja en la final (override manual)
    roja = OVERRIDES.get("tarjeta_roja_final")
    if st["final_done"] and roja is not None:
        estado, puntos = decidida(norm(p.get("q16", "")) == norm("Sí" if roja else "No"), 5)
    else:
        estado, puntos = "pendiente", 0
    items.append(q(16, "¿Roja en la final?", p.get("q16", ""), estado, puntos, 5))

    # 17 minuto del primer gol (exacto 10 / ±5 5)
    minuto_real = OVERRIDES.get("minuto_primer_gol_final")
    sin_goles = OVERRIDES.get("final_sin_goles")
    minute_dist = None
    if st["final_done"] and (minuto_real is not None or sin_goles):
        pred_min, pred_nogol = parse_minute(p.get("q17", ""))
        if sin_goles:
            puntos = 10 if pred_nogol else 0
            minute_dist = 0 if pred_nogol else 999
        elif pred_nogol or pred_min is None:
            puntos, minute_dist = 0, 999
        else:
            minute_dist = abs(pred_min - minuto_real)
            puntos = 10 if minute_dist == 0 else (5 if minute_dist <= 5 else 0)
        estado = "acertado" if puntos else "fallado"
    else:
        estado, puntos = "pendiente", 0
    items.append(q(17, "Minuto del primer gol de la final", p.get("q17", ""), estado, puntos, 10))

    total = sum(i["puntos"] for i in items)
    maximo = sum(i["max"] if i["estado"] == "pendiente" else i["puntos"] for i in items)

    # criterios de desempate (en orden), menores = mejor
    n_semis = sum(1 for t in p.get("q3", []) if t in st["semifinalistas"])
    n_cuartos = sum(1 for t in p.get("q4", []) if t in st["cuartofinalistas"])
    tiebreak = (
        0 if (st["final_done"] and p.get("q1") == st["campeon"]) else 1,
        0 if (st["final_done"] and p.get("q2") == st["subcampeon"]) else 1,
        -n_semis,
        -n_cuartos,
        esp_dist if esp_dist is not None else 99,
        minute_dist if minute_dist is not None else 999,
    )

    return {
        "nombre": p["nombre"],
        "puntos": total,
        "max_posible": maximo,
        "desglose": items,
        "tiebreak": tiebreak,
        "minute_dist": minute_dist,
        "predijo_nogol": parse_minute(p.get("q17", ""))[1],
        "minuto_pred": parse_minute(p.get("q17", ""))[0],
    }


def rank(scored):
    """Ordena con desempates y asigna posición (empates comparten posición)."""
    scored.sort(key=lambda s: (-s["puntos"], s["tiebreak"], norm(s["nombre"])))
    prev_key, prev_rank = None, 0
    for i, s in enumerate(scored, 1):
        key = (-s["puntos"], s["tiebreak"])
        s["rank"] = prev_rank if key == prev_key else i
        prev_key, prev_rank = key, s["rank"]
    return scored


def prizes(scored, st):
    """Reparte el bote: 60/25/10 por posición (empates comparten) y 5% especial."""
    n = len(scored)
    aport = CONFIG.get("aportacion_eur") or 0
    bote = round(n * aport, 2)
    reparto = CONFIG["reparto"]
    shares = [reparto["primero"], reparto["segundo"], reparto["tercero"]]
    for s in scored:
        s["premio_eur"] = 0.0
    if bote and st["final_done"]:
        pos = 0
        while pos < min(3, n):
            tied = [s for s in scored if s["rank"] == scored[pos]["rank"]]
            cubre = shares[pos:pos + len(tied)]
            for s in tied:
                s["premio_eur"] = round(bote * sum(cubre) / len(tied), 2)
            pos += len(tied)
        # premio especial: más cerca del minuto del primer gol
        sin_goles = OVERRIDES.get("final_sin_goles")
        minuto = OVERRIDES.get("minuto_primer_gol_final")
        ganadores = []
        if sin_goles:
            ganadores = [s for s in scored if s["predijo_nogol"]]
            if not ganadores:  # nadie puso 'no hay gol': gana el minuto más alto
                con_min = [s for s in scored if s["minuto_pred"] is not None]
                if con_min:
                    top = max(s["minuto_pred"] for s in con_min)
                    ganadores = [s for s in con_min if s["minuto_pred"] == top]
        elif minuto is not None:
            con_min = [s for s in scored if s["minuto_pred"] is not None]
            if con_min:
                best = min(abs(s["minuto_pred"] - minuto) for s in con_min)
                ganadores = [s for s in con_min if abs(s["minuto_pred"] - minuto) == best]
        for s in ganadores:
            s["premio_eur"] = round(s["premio_eur"] + bote * reparto["especial"] / len(ganadores), 2)
            s["premio_especial"] = True
    return bote


# ------------------------------------------------------------------ main

def main():
    raw = api_get("/competitions/WC/matches")["matches"]
    try:
        scorers_raw = api_get("/competitions/WC/scorers?limit=50").get("scorers", [])
    except Exception as e:  # noqa: BLE001 - los goleadores no son críticos
        print(f"Aviso: no pude leer goleadores ({e})")
        scorers_raw = []
    scorers = [{"player": s["player"]["name"],
                "team": team_es(s["team"]),
                "goals": s.get("goals") or 0} for s in scorers_raw]

    rows, demo = load_responses()
    predictions = parse_predictions(rows)
    print(f"{len(predictions)} participantes ({'EJEMPLO' if demo else 'reales'})")

    st = tournament_state(raw, scorers)
    scored = rank([score_person(p, st) for p in predictions])
    bote = prizes(scored, st)

    # clasificación provisional con los partidos en juego como si acabaran así
    live_matches = [m for m in st["matches"] if m["live"]]
    live_block = None
    if live_matches:
        st_live = tournament_state(raw, scorers, live_mode=True)
        scored_live = rank([score_person(p, st_live) for p in predictions])
        prizes(scored_live, st_live)
        oficial = {s["nombre"]: s for s in scored}
        live_block = {
            "participantes": [{
                "nombre": s["nombre"], "puntos": s["puntos"], "rank": s["rank"],
                "delta_puntos": s["puntos"] - oficial[s["nombre"]]["puntos"],
                "delta_rank": oficial[s["nombre"]]["rank"] - s["rank"],
            } for s in scored_live],
        }

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    # history: una entrada por cambio de puntos
    hist_file = DATA / "history.json"
    history = json.loads(hist_file.read_text(encoding="utf-8")) if hist_file.exists() else []
    snapshot = {s["nombre"]: s["puntos"] for s in scored}
    if not history or history[-1]["puntos"] != snapshot:
        history.append({"ts": now, "puntos": snapshot})

    standings = {
        "updated": now,
        "demo": demo,
        "bote_eur": bote,
        "aportacion_eur": CONFIG.get("aportacion_eur"),
        "n_participantes": len(scored),
        "tournament_over": st["tournament_over"],
        "campeon": st["campeon"],
        "participantes": scored,
        "live": live_block,
    }

    matches_out = {
        "updated": now,
        "matches": st["matches"],
        "tables": st["tables"],
        "groups_done": st["groups_done"],
        "reached": st["reached"],
        "semifinalistas": sorted(st["semifinalistas"]),
        "cuartofinalistas": sorted(st["cuartofinalistas"]),
        "revelacion_actual": sorted(st["revelacion"]),
        "decepcion_actual": sorted(st["decepcion"]),
        "scorers": scorers[:15],
    }

    for name, obj in (("standings.json", standings), ("matches.json", matches_out),
                      ("predictions.json", {"updated": now, "demo": demo,
                                            "participantes": predictions}),
                      ("history.json", history)):
        (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1),
                                 encoding="utf-8")
        print(f"escrito data/{name}")


if __name__ == "__main__":
    main()
