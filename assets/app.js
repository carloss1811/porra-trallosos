/* Porra Trallosa — frontend. Lee los JSON de data/ y pinta todo. */

const STAGE_LABEL = {
  GROUP_STAGE: "Grupos",
  LAST_32: "Dieciseisavos",
  LAST_16: "Octavos",
  QUARTER_FINALS: "Cuartos",
  SEMI_FINALS: "Semifinales",
  THIRD_PLACE: "3er puesto",
  FINAL: "FINAL",
};
const KO_STAGES = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];

let D = { standings: null, matches: null, predictions: null, history: [] };

/* banderas: ISO 3166 para flagcdn.com (se ven igual en todos los dispositivos) */
const FLAG_CODE = {
  "México": "mx", "Sudáfrica": "za", "Corea del Sur": "kr", "Chequia": "cz",
  "Canadá": "ca", "Bosnia y Herzegovina": "ba", "Catar": "qa", "Suiza": "ch",
  "Brasil": "br", "Marruecos": "ma", "Haití": "ht", "Escocia": "gb-sct",
  "Estados Unidos": "us", "Paraguay": "py", "Australia": "au", "Turquía": "tr",
  "Alemania": "de", "Curazao": "cw", "Costa de Marfil": "ci", "Ecuador": "ec",
  "Países Bajos": "nl", "Japón": "jp", "Suecia": "se", "Túnez": "tn",
  "Bélgica": "be", "Egipto": "eg", "Irán": "ir", "Nueva Zelanda": "nz",
  "España": "es", "Cabo Verde": "cv", "Arabia Saudí": "sa", "Uruguay": "uy",
  "Francia": "fr", "Senegal": "sn", "Irak": "iq", "Noruega": "no",
  "Argentina": "ar", "Argelia": "dz", "Austria": "at", "Jordania": "jo",
  "Portugal": "pt", "RD Congo": "cd", "Uzbekistán": "uz", "Colombia": "co",
  "Inglaterra": "gb-eng", "Croacia": "hr", "Ghana": "gh", "Panamá": "pa",
};
const TEAM_NAMES = Object.keys(FLAG_CODE).sort((a, b) => b.length - a.length);

function flagImg(name) {
  const code = FLAG_CODE[name];
  return code ? `<img class="flag-img" src="assets/flags/${code}.png" alt="" loading="lazy">` : "";
}

/* añade su bandera a cada selección mencionada en un texto libre */
function decorate(text) {
  let t = esc(text);
  for (const n of TEAM_NAMES) t = t.split(n).join(`${flagImg(n)}${n}`);
  return t;
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function fetchJSON(name) {
  const r = await fetch(`data/${name}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
}

function fmtEUR(x) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(x || 0);
}

function fmtFecha(utc) {
  return new Date(utc).toLocaleString("es-ES", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  });
}

function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.round(min / 60)} h`;
}

function teamHTML(name) {
  if (!name) return '<span class="muted">Por definir</span>';
  return `${flagImg(name)}${esc(name)}`;
}

/* ---------------- fotos de los trallosos ---------------- */
/* Para poner foto a alguien: sube assets/fotos/<nombre>.jpg (o .png).
   El archivo se llama como el participante, en minúsculas, sin tildes y con
   guiones en vez de espacios (p. ej. "Tete" → tete.jpg,
   "YO NO FUI FUE EL VAR" → no-es-locura-es-agricultura.jpg).
   Mientras no haya foto se enseñan sus iniciales. */

function fotoSlug(nombre) {
  return String(nombre).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function iniciales(nombre) {
  const w = String(nombre).trim().split(/\s+/);
  return ((w[0]?.[0] || "?") + (w[1]?.[0] || "")).toUpperCase();
}

const AVATAR_COLORS = ["#5d8bff", "#2ee59d", "#ff9d40", "#ff5470", "#b07cff", "#3ecbe0"];

function avatarColor(nombre) {
  let h = 0;
  for (const c of String(nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* si no hay .jpg prueba .png; si tampoco, deja las iniciales */
function avatarError(img) {
  if (!img.dataset.png) { img.dataset.png = "1"; img.src = img.src.replace(/\.jpg$/, ".png"); return; }
  img.style.display = "none";
  img.nextElementSibling.style.display = "inline-flex";
}

function avatarHTML(nombre, cls = "") {
  return `<img class="avatar ${cls}" src="assets/fotos/${fotoSlug(nombre)}.jpg" alt="" loading="lazy" onerror="avatarError(this)"><span class="avatar avatar-ini ${cls}" style="display:none;background:${avatarColor(nombre)}">${esc(iniciales(nombre))}</span>`;
}

/* ---------------- header ---------------- */

function cuentaAtras(target) {
  let ms = new Date(target) - Date.now();
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function renderPlazo() {
  const el = $("plazo-banner");
  const s = D.standings;
  if (!s || !s.predicciones_ocultas) { el.classList.add("hidden"); return; }
  const restante = cuentaAtras(s.deadline_utc);
  if (!restante) { el.classList.add("hidden"); return; }
  const btn = s.form_url
    ? ` <a class="btn-form" href="${esc(s.form_url)}" target="_blank" rel="noopener">📝 Rellenar mi porra</a>`
    : "";
  const cierre = new Date(s.deadline_utc).toLocaleString("es-ES",
    { weekday: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  el.innerHTML = `🔒 Porras selladas hasta el cierre · puedes enviar la tuya hasta el ${esc(cierre)} · quedan <b>${restante}</b>${btn}`;
  el.classList.remove("hidden");
}

function renderHeader() {
  const s = D.standings;
  $("demo-banner").classList.toggle("hidden", !s.demo);
  $("chip-bote").textContent = s.bote_eur ? fmtEUR(s.bote_eur) : "por decidir";
  $("chip-participantes").textContent = s.n_participantes;
  $("chip-updated").textContent = timeAgo(s.updated);

  const live = D.matches.matches.filter((m) => m.live);
  const wrap = $("chip-live-wrap");
  if (live.length) {
    wrap.classList.add("chip-live");
    $("chip-next-label").textContent = "EN JUEGO";
    const m = live[0];
    $("chip-next").innerHTML = `${teamHTML(m.home)} ${m.gh ?? 0}-${m.ga ?? 0} ${teamHTML(m.away)}`;
    $("live-badge").classList.remove("hidden");
  } else {
    wrap.classList.remove("chip-live");
    $("chip-next-label").textContent = "PRÓXIMO";
    const next = D.matches.matches
      .filter((m) => !m.finished && m.home && m.away)
      .sort((a, b) => a.utc.localeCompare(b.utc))[0];
    $("chip-next").innerHTML = next ? `${teamHTML(next.home)} – ${teamHTML(next.away)} · ${fmtFecha(next.utc)}` : "—";
    $("live-badge").classList.add("hidden");
  }
}

/* ---------------- clasificación ---------------- */

function medalla(rank) {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}º`;
}

function renderPodio() {
  const top = D.standings.participantes.slice(0, 3);
  $("podio").innerHTML = top.map((p, i) => `
    <div class="podio-card p${i + 1}">
      <span class="podio-num">${p.rank}</span>
      <div class="podio-avatar">${avatarHTML(p.nombre, "avatar-lg")}</div>
      <div class="podio-nombre">${esc(p.nombre)}</div>
      <div class="podio-puntos">${p.puntos}<small>pts${p.puntos_prov > p.puntos ? ` · <span class="rk-prov">≈${p.puntos_prov}</span>` : ""} · máx ${p.max_posible}</small></div>
      <div class="podio-premio">${p.premio_eur ? fmtEUR(p.premio_eur) : ""}${p.premio_especial ? " 🎯" : ""}</div>
    </div>`).join("");
}

function hayPartidoEnJuego() {
  return D.matches && D.matches.matches.some((m) => m.live);
}

function desgloseHTML(p) {
  const enJuego = hayPartidoEnJuego();
  return `<div class="desglose-grid">${p.desglose.map((i) => {
    const prov = i.estado === "pendiente" && i.prov != null && i.prov > i.puntos;
    const pts = i.estado !== "pendiente" ? `${i.puntos}/${i.max}`
      : prov ? `≈ ${i.prov}/${i.max}` : `⏳ 0/${i.max}`;
    return `
    <div class="q-item q-${i.estado}${prov ? " q-prov" : ""}">
      <div class="q-titulo">${esc(i.titulo)}${prov && enJuego ? '<i class="dot-live" title="hay partido en juego: puede cambiar"></i>' : ""}</div>
      <div class="q-resp">${decorate(i.respuesta) || "—"}</div>
      <div><span class="q-pts">${pts}</span>${prov ? '<span class="q-nota"> · provisional</span>' : ""}
      ${i.nota ? `<span class="q-nota"> · ${decorate(i.nota)}</span>` : ""}</div>
    </div>`;
  }).join("")}</div>`;
}

function renderRanking() {
  const lider = Math.max(1, ...D.standings.participantes.map((p) => p.puntos));
  const rows = D.standings.participantes.map((p, idx) => `
    <div class="rk-row" data-idx="${idx}">
      <span class="rk-pos">${p.rank}</span>
      ${avatarHTML(p.nombre)}
      <span class="rk-main">
        <span class="rk-nombre">${esc(p.nombre)}${p.premio_especial ? " 🎯" : ""}</span>
        <span class="rk-bar"><i style="width:${Math.max(2, (p.puntos / lider) * 100)}%"></i></span>
      </span>
      <span class="rk-max">máx ${p.max_posible}</span>
      <span class="rk-pts">${p.puntos}${p.puntos_prov > p.puntos ? `<span class="rk-prov">≈${p.puntos_prov}${hayPartidoEnJuego() ? '<i class="dot-live"></i>' : ""}</span>` : ""}</span>
      <span class="rk-premio">${p.premio_eur ? fmtEUR(p.premio_eur) : ""}</span>
    </div>
    <div class="desglose hidden" id="desglose-${idx}">${desgloseHTML(p)}</div>`).join("");

  $("ranking").innerHTML = `
    <h2>Clasificación general</h2>
    <p class="muted small">Toca a un tralloso para ver su desglose pregunta a pregunta. "Máx" es lo que aún puede llegar a sumar.
      Los puntos <span class="rk-prov">≈ azules</span> son provisionales: así quedaría si el Mundial acabara hoy.
      ${hayPartidoEnJuego() ? 'El puntito rojo <i class="dot-live"></i> avisa de que hay partido en juego y pueden cambiar de un minuto a otro.' : ""}</p>
    <div class="rk">${rows}</div>`;

  document.querySelectorAll(".rk-row").forEach((el) => {
    el.addEventListener("click", () => $(`desglose-${el.dataset.idx}`).classList.toggle("hidden"));
  });
}

function renderChart() {
  const canvas = $("chart");
  const hist = D.history;
  const names = D.standings.participantes.map((p) => p.nombre);
  if (hist.length < 2) {
    canvas.style.display = "none";
    $("chart-empty").textContent = "La gráfica aparecerá cuando empiecen a moverse los puntos.";
    return;
  }
  canvas.style.display = "block";
  $("chart-empty").textContent = "";
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || canvas.parentElement.clientWidth - 40;
  const H = 260;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const colors = ["#ffc940", "#2ee59d", "#5d8bff", "#ff5470", "#c490ff", "#5de1ff", "#ffa15d", "#9dff5d"];
  const maxPts = Math.max(10, ...hist.flatMap((h) => Object.values(h.puntos)));
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const x = (i) => pad.l + (i / (hist.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / maxPts) * (H - pad.t - pad.b);

  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.fillStyle = "#7e88a6"; ctx.font = "10px JetBrains Mono, monospace";
  for (let g = 0; g <= 4; g++) {
    const v = Math.round((maxPts / 4) * g);
    ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(W - pad.r, y(v)); ctx.stroke();
    ctx.fillText(v, 4, y(v) + 3);
  }
  names.forEach((n, ni) => {
    ctx.strokeStyle = colors[ni % colors.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach((h, i) => {
      const v = h.puntos[n] ?? 0;
      i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v));
    });
    ctx.stroke();
    const last = hist[hist.length - 1].puntos[n] ?? 0;
    ctx.fillStyle = colors[ni % colors.length];
    ctx.fillText(n.split(" ")[0], Math.min(x(hist.length - 1) + 4, W - 60), y(last) + 3);
  });
}

/* ---------------- en vivo ---------------- */

function renderVivo() {
  const live = D.matches.matches.filter((m) => m.live);
  const lm = $("live-matches");
  const ls = $("live-standings");
  const px = $("proximos");

  if (live.length) {
    lm.innerHTML = live.map((m) => `
      <div class="live-card">
        <div class="match-line">
          <span>${teamHTML(m.home)}</span>
          <span class="match-score">${m.gh ?? 0} – ${m.ga ?? 0}</span>
          <span>${teamHTML(m.away)}</span>
        </div>
        <div class="match-meta"><span class="en-juego">● EN JUEGO</span>
          ${m.minute ? ` · min ${esc(m.minute)}` : ""} · ${STAGE_LABEL[m.stage] || m.stage}${m.group ? ` · Grupo ${m.group}` : ""}</div>
      </div>`).join("");
  } else {
    lm.innerHTML = `<div class="bloque"><h2>En vivo</h2><p class="muted">Ahora mismo no hay ningún partido en juego. Cuando lo haya, aquí verás el marcador y cómo afectaría al ranking si acabara así.</p></div>`;
  }

  const lb = D.standings.live;
  if (lb && live.length) {
    ls.innerHTML = `<div class="bloque">
      <h2>Ranking provisional (si los partidos acaban así)</h2>
      <div class="table-scroll"><table>
        <thead><tr><th></th><th>Tralloso</th><th class="num">Puntos</th><th class="num">Δ pts</th><th class="num">Δ pos</th></tr></thead>
        <tbody>${lb.participantes.map((p) => `
          <tr>
            <td class="rank-pos">${medalla(p.rank)}</td>
            <td><b>${esc(p.nombre)}</b></td>
            <td class="num rank-puntos">${p.puntos}</td>
            <td class="num ${p.delta_puntos > 0 ? "delta-up" : "delta-zero"}">${p.delta_puntos > 0 ? "+" + p.delta_puntos : p.delta_puntos}</td>
            <td class="num ${p.delta_rank > 0 ? "delta-up" : p.delta_rank < 0 ? "delta-down" : "delta-zero"}">
              ${p.delta_rank > 0 ? "▲" + p.delta_rank : p.delta_rank < 0 ? "▼" + Math.abs(p.delta_rank) : "="}</td>
          </tr>`).join("")}</tbody>
      </table></div></div>`;
  } else {
    ls.innerHTML = "";
  }

  const espana = D.matches.matches
    .filter((m) => !m.finished && !m.live && (m.home === "España" || m.away === "España"))
    .sort((a, b) => a.utc.localeCompare(b.utc))[0];
  const espanaCard = espana ? `
    <div class="espana-card">
      <h2>${flagImg("España")}Próximo partido de España</h2>
      <div class="match-line">
        <span>${teamHTML(espana.home)}</span>
        <span class="match-score espana-vs" data-utc="${espana.utc}">VS</span>
        <span>${teamHTML(espana.away)}</span>
      </div>
      <div class="match-meta">${STAGE_LABEL[espana.stage] || espana.stage}${espana.group ? ` · Grupo ${espana.group}` : ""}
        · ${fmtFecha(espana.utc)} · faltan <b class="espana-countdown">${cuentaAtras(espana.utc) || "nada"}</b></div>
    </div>` : "";

  const proximos = D.matches.matches
    .filter((m) => !m.finished && !m.live)
    .sort((a, b) => a.utc.localeCompare(b.utc))
    .slice(0, 8);
  px.innerHTML = `${espanaCard}<div class="bloque"><h2>Próximos partidos</h2>
    ${proximos.map((m) => `
      <div class="proximo-item">
        <span>${teamHTML(m.home)} – ${teamHTML(m.away)}</span>
        <span class="muted">${STAGE_LABEL[m.stage] || m.stage}${m.group ? ` · Grupo ${m.group}` : ""} · ${fmtFecha(m.utc)}</span>
      </div>`).join("") || '<p class="muted">No quedan partidos. ¡Se acabó el Mundial!</p>'}
  </div>`;
}

/* ---------------- partidos ---------------- */

function renderGrupos() {
  const letras = Object.keys(D.matches.tables);
  $("grupos").innerHTML = letras.map((L) => {
    const t = D.matches.tables[L];
    const done = D.matches.groups_done[L];
    return `<div class="grupo-card">
      <h3>GRUPO ${L}${done ? " ✓" : ""}</h3>
      <table>
        <thead><tr><th>Equipo</th><th class="num">PJ</th><th class="num">DG</th><th class="num">Pts</th></tr></thead>
        <tbody>${t.map((r, i) => `
          <tr class="${i < 2 ? "fila-pasa" : ""}">
            <td><span class="equipo-cell">${teamHTML(r.equipo)}</span></td>
            <td class="num">${r.pj}</td><td class="num">${r.dg > 0 ? "+" + r.dg : r.dg}</td><td class="num"><b>${r.pts}</b></td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
  }).join("");
}

function bracketMatchHTML(m) {
  const score = m.gh != null ? `${m.gh}–${m.ga}` : fmtFecha(m.utc).split(",")[0];
  const pen = m.penalties && m.penalties.home != null ? ` <span class="muted small">(${m.penalties.home}–${m.penalties.away} pen)</span>` : "";
  const row = (team, goals) => `
    <div class="bracket-team ${m.winner && m.winner === team ? "winner" : ""}">
      <span>${teamHTML(team)}</span><span class="bracket-score">${goals ?? ""}</span>
    </div>`;
  return `<div class="bracket-match ${m.live ? "live" : ""}">
    ${row(m.home, m.gh)}${row(m.away, m.ga)}
    <div class="bracket-fecha">${m.live ? "● EN JUEGO" : m.finished ? "Final" + pen : fmtFecha(m.utc)}</div>
  </div>`;
}

function renderBracket() {
  $("bracket").innerHTML = KO_STAGES.map((st) => {
    const ms = D.matches.matches.filter((m) => m.stage === st).sort((a, b) => a.utc.localeCompare(b.utc));
    if (!ms.length) return "";
    return `<div class="bracket-col"><h3>${STAGE_LABEL[st]}</h3>${ms.map(bracketMatchHTML).join("")}</div>`;
  }).join("");
}

function renderGoleadores() {
  const sc = D.matches.scorers || [];
  $("goleadores").innerHTML = sc.length
    ? `<table><thead><tr><th>#</th><th>Jugador</th><th>Selección</th><th class="num">Goles</th></tr></thead>
       <tbody>${sc.map((s, i) => `<tr><td>${i + 1}</td><td><b>${esc(s.player)}</b></td>
         <td><span class="equipo-cell">${teamHTML(s.team)}</span></td><td class="num">${s.goals}</td></tr>`).join("")}</tbody></table>`
    : '<p class="muted">Todavía no hay goles. Paciencia, tralloso.</p>';
}

/* ---------------- predicciones ---------------- */

/* agrupa respuestas de texto libre ignorando mayúsculas y tildes */
function agrupaVotos(ps, key) {
  const m = new Map();
  ps.forEach((p) => {
    const raw = String(p[key] || "").trim();
    if (!raw) return;
    const k = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!m.has(k)) m.set(k, { label: raw, n: 0 });
    m.get(k).n += 1;
  });
  return [...m.values()].sort((a, b) => b.n - a.n);
}

function renderConsenso(ps) {
  const campeones = agrupaVotos(ps, "q1");
  if (!campeones.length) { $("consenso").innerHTML = ""; return; }
  const total = ps.length;
  const barras = campeones.map((c) => `
    <div class="cons-fila">
      <span class="cons-equipo">${decorate(c.label)}</span>
      <span class="cons-barra"><i style="width:${(c.n / total) * 100}%"></i></span>
      <span class="cons-n">${c.n}</span>
    </div>`).join("");

  const dato = (label, key) => {
    const top = agrupaVotos(ps, key)[0];
    return top ? `<div class="cons-dato"><span class="cons-label">${label}</span>${decorate(top.label)} <span class="cons-n">×${top.n}</span></div>` : "";
  };
  const solitarios = ps.filter((p) => {
    const k = String(p.q1 || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return campeones.find((c) => c.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === k)?.n === 1;
  });

  $("consenso").innerHTML = `
    <section class="bloque consenso">
      <h2>El consenso tralloso</h2>
      <div class="cons-grid">
        <div>
          <p class="muted small" style="margin-bottom:.5rem">¿Quién gana el Mundial según la porra?</p>
          ${barras}
        </div>
        <div>
          ${dato("Pichichi más votado", "q5")}
          ${dato("Revelación favorita", "q6")}
          ${dato("Decepción más temida", "q7")}
          ${solitarios.length ? `<div class="cons-dato"><span class="cons-label">A contracorriente (campeón que nadie más votó)</span>${solitarios.map((p) => esc(p.nombre)).join(", ")}</div>` : ""}
        </div>
      </div>
    </section>`;
}

function renderPredicciones() {
  const ps = D.predictions.participantes;
  if (!ps.length) {
    $("predicciones-tabla").innerHTML = '<p class="muted">Aún no hay respuestas.</p>';
    $("consenso").innerHTML = "";
    return;
  }
  if (D.predictions.ocultas) {
    $("consenso").innerHTML = "";
    const cierre = new Date(D.predictions.deadline_utc).toLocaleString("es-ES",
      { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
    $("predicciones-tabla").innerHTML = `
      <p>🤫 <b>Las porras están selladas.</b> Se revelan cuando se cierre el plazo
      (${esc(cierre)}), para que nadie pueda copiar.</p>
      <p class="muted small">Ya han enviado la suya:</p>
      <ul>${ps.map((p) => `<li>${avatarHTML(p.nombre)}<b>${esc(p.nombre)}</b> ✅</li>`).join("")}</ul>`;
    return;
  }
  renderConsenso(ps);
  $("predicciones-tabla").innerHTML = `<table>
    <thead><tr><th>Tralloso</th><th>Campeón</th><th>Subcampeón</th><th>Pichichi</th>
      <th>España llega a</th><th>Revelación</th><th>Decepción</th><th>Final</th></tr></thead>
    <tbody>${ps.map((p, i) => `
      <tr>
        <td class="pred-nombre" data-idx="${i}">${avatarHTML(p.nombre)}${esc(p.nombre)}</td>
        <td><span class="pred-pill">${decorate(p.q1)}</span></td>
        <td><span class="pred-pill">${decorate(p.q2)}</span></td>
        <td>${esc(p.q5)}</td>
        <td><span class="pred-pill">${esc(p.q8)}</span></td>
        <td>${decorate(p.q6)}</td>
        <td>${decorate(p.q7)}</td>
        <td class="small">${decorate(p.q13)}</td>
      </tr>`).join("")}</tbody>
  </table>`;
  document.querySelectorAll(".pred-nombre").forEach((td) => {
    td.addEventListener("click", () => showFicha(ps[td.dataset.idx]));
  });
}

function showFicha(p) {
  const grupos = Object.keys(p.grupos || {}).sort().map((L) =>
    `<tr><td>Grupo ${L}</td><td>${decorate(p.grupos[L]["1"])}</td><td>${decorate(p.grupos[L]["2"])}</td></tr>`).join("");
  $("modal-body").innerHTML = `
    <h2>${avatarHTML(p.nombre)}La porra de ${esc(p.nombre)}</h2>
    <table>
      <tr><td>Campeón</td><td colspan="2"><b>${decorate(p.q1)}</b></td></tr>
      <tr><td>Subcampeón</td><td colspan="2">${decorate(p.q2)}</td></tr>
      <tr><td>Semifinalistas</td><td colspan="2">${decorate((p.q3 || []).join(", "))}</td></tr>
      <tr><td>Cuartofinalistas</td><td colspan="2" class="small">${decorate((p.q4 || []).join(", "))}</td></tr>
      <tr><td>Pichichi</td><td colspan="2">${esc(p.q5)}</td></tr>
      <tr><td>Revelación / Decepción</td><td colspan="2">${decorate(p.q6)} / ${decorate(p.q7)}</td></tr>
      <tr><td>España llega a</td><td colspan="2">${esc(p.q8)} · ¿Gana su grupo? ${esc(p.q9)}</td></tr>
      <tr><td>Goleador de España / primero</td><td colspan="2">${esc(p.q10)} / ${esc(p.q12)}</td></tr>
      <tr><td>Goles de España</td><td colspan="2">${esc(p.q11)}</td></tr>
      <tr><th>Grupos</th><th>1º</th><th>2º</th></tr>
      ${grupos}
      <tr><td>Final</td><td colspan="2"><b>${decorate(p.q13)}</b> · gana ${decorate(p.q14)}</td></tr>
      <tr><td>¿Penaltis? / ¿Roja?</td><td colspan="2">${esc(p.q15)} / ${esc(p.q16)}</td></tr>
      <tr><td>Minuto primer gol final</td><td colspan="2">${esc(p.q17)}</td></tr>
    </table>`;
  $("modal").classList.remove("hidden");
}

/* ---------------- arranque ---------------- */

function renderAll() {
  renderPlazo();
  renderHeader();
  renderPodio();
  renderRanking();
  renderChart();
  renderVivo();
  renderGrupos();
  renderBracket();
  renderGoleadores();
  renderPredicciones();
}

async function load() {
  try {
    const [standings, matches, predictions, history] = await Promise.all([
      fetchJSON("standings.json"), fetchJSON("matches.json"),
      fetchJSON("predictions.json"), fetchJSON("history.json"),
    ]);
    D = { standings, matches, predictions, history };
    renderAll();
    refreshLive();
  } catch (e) {
    console.error(e);
    $("ranking").innerHTML = `<p class="muted">No pude cargar los datos (${esc(e.message)}). Si la porra acaba de crearse, ejecuta la action "Actualizar datos" en GitHub.</p>`;
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "clasificacion") renderChart();
  });
});

load();
setInterval(load, 60000); // refresco cada minuto

/* ----- marcador en directo (ESPN) entre actualizaciones del repo -----
   Los datos del repo se regeneran cada ~5 min; para el minuto a minuto el
   navegador consulta el scoreboard público de ESPN y parchea marcador,
   minuto y estado de los partidos en juego. */

const ESPN_ES = {};
[["Mexico", "México"], ["South Africa", "Sudáfrica"], ["South Korea", "Corea del Sur"],
 ["Czechia", "Chequia"], ["Czech Republic", "Chequia"], ["Canada", "Canadá"],
 ["Bosnia and Herzegovina", "Bosnia y Herzegovina"], ["Bosnia-Herzegovina", "Bosnia y Herzegovina"],
 ["Qatar", "Catar"], ["Switzerland", "Suiza"], ["Brazil", "Brasil"], ["Morocco", "Marruecos"],
 ["Haiti", "Haití"], ["Scotland", "Escocia"], ["United States", "Estados Unidos"], ["USA", "Estados Unidos"],
 ["Paraguay", "Paraguay"], ["Australia", "Australia"], ["Turkey", "Turquía"], ["Türkiye", "Turquía"],
 ["Germany", "Alemania"], ["Curacao", "Curazao"], ["Curaçao", "Curazao"],
 ["Ivory Coast", "Costa de Marfil"], ["Côte d'Ivoire", "Costa de Marfil"],
 ["Ecuador", "Ecuador"], ["Netherlands", "Países Bajos"], ["Japan", "Japón"], ["Sweden", "Suecia"],
 ["Tunisia", "Túnez"], ["Belgium", "Bélgica"], ["Egypt", "Egipto"], ["Iran", "Irán"],
 ["New Zealand", "Nueva Zelanda"], ["Spain", "España"], ["Cape Verde", "Cabo Verde"],
 ["Saudi Arabia", "Arabia Saudí"], ["Uruguay", "Uruguay"], ["France", "Francia"],
 ["Senegal", "Senegal"], ["Iraq", "Irak"], ["Norway", "Noruega"], ["Argentina", "Argentina"],
 ["Algeria", "Argelia"], ["Austria", "Austria"], ["Jordan", "Jordania"], ["Portugal", "Portugal"],
 ["DR Congo", "RD Congo"], ["Congo DR", "RD Congo"], ["Uzbekistan", "Uzbekistán"],
 ["Colombia", "Colombia"], ["England", "Inglaterra"], ["Croatia", "Croacia"],
 ["Ghana", "Ghana"], ["Panama", "Panamá"],
].forEach(([en, es]) => { ESPN_ES[fotoSlug(en)] = es; });

async function refreshLive() {
  if (!D.matches) return;
  const ahora = Date.now();
  // solo consulta si hay un partido en juego o que debería haber empezado hace <3h
  const interesa = D.matches.matches.some((m) => m.live ||
    (!m.finished && new Date(m.utc) <= ahora && ahora - new Date(m.utc) < 3 * 3600000));
  if (!interesa) return;
  try {
    const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${hoy}`);
    if (!r.ok) return;
    const d = await r.json();
    let cambio = false;
    for (const ev of d.events || []) {
      const comp = ev.competitions?.[0];
      const state = ev.status?.type?.state; // pre / in / post
      if (!comp || state === "pre") continue;
      const lados = {};
      (comp.competitors || []).forEach((c) => { lados[c.homeAway] = c; });
      const home = ESPN_ES[fotoSlug(lados.home?.team?.displayName || "")];
      const away = ESPN_ES[fotoSlug(lados.away?.team?.displayName || "")];
      const m = D.matches.matches.find((x) => !x.finished && x.home === home && x.away === away);
      if (!m) continue;
      const gh = +(lados.home?.score ?? 0);
      const ga = +(lados.away?.score ?? 0);
      const live = state === "in";
      const minute = String(ev.status?.displayClock || "").replace(/'$/, "");
      if (m.gh !== gh || m.ga !== ga || m.live !== live || m.minute !== minute) {
        Object.assign(m, { gh, ga, live, minute, finished: state === "post" });
        cambio = true;
      }
    }
    if (cambio) { renderHeader(); renderVivo(); }
  } catch (e) { /* sin red o ESPN caído: el repo sigue mandando */ }
}
setInterval(refreshLive, 60000);

// cuentas atrás vivas (plazo y partido de España)
setInterval(() => {
  renderPlazo();
  const vs = document.querySelector(".espana-vs");
  const cd = document.querySelector(".espana-countdown");
  if (vs && cd) cd.textContent = cuentaAtras(vs.dataset.utc) || "¡ya!";
}, 1000);
