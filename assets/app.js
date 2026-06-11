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
let crest = {};

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

function teamHTML(name, withCrest = true) {
  if (!name) return '<span class="muted">Por definir</span>';
  const img = withCrest && crest[name] ? `<img src="${crest[name]}" alt="" loading="lazy">` : "";
  return `${img}${esc(name)}`;
}

/* ---------------- header ---------------- */

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
    $("chip-next").textContent = `${m.home} ${m.gh ?? 0}-${m.ga ?? 0} ${m.away}`;
    $("live-badge").classList.remove("hidden");
  } else {
    wrap.classList.remove("chip-live");
    $("chip-next-label").textContent = "PRÓXIMO";
    const next = D.matches.matches
      .filter((m) => !m.finished && m.home && m.away)
      .sort((a, b) => a.utc.localeCompare(b.utc))[0];
    $("chip-next").textContent = next ? `${next.home} – ${next.away} · ${fmtFecha(next.utc)}` : "—";
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
      <div class="podio-medal">${medalla(p.rank)}</div>
      <div class="podio-nombre">${esc(p.nombre)}</div>
      <div class="podio-puntos">${p.puntos} pts</div>
      <div class="podio-premio">${p.premio_eur ? fmtEUR(p.premio_eur) : ""}${p.premio_especial ? " 🎯" : ""}</div>
      <div class="small muted">máx. posible: ${p.max_posible}</div>
    </div>`).join("");
}

function desgloseHTML(p) {
  return `<div class="desglose-grid">${p.desglose.map((i) => `
    <div class="q-item q-${i.estado}">
      <div class="q-titulo">${esc(i.titulo)}</div>
      <div class="q-resp">${esc(i.respuesta) || "—"}</div>
      <div><span class="q-pts">${i.estado === "pendiente" ? `⏳ 0/${i.max}` : `${i.puntos}/${i.max}`}</span>
      ${i.nota ? `<span class="q-nota"> · ${esc(i.nota)}</span>` : ""}</div>
    </div>`).join("")}</div>`;
}

function renderRanking() {
  const rows = D.standings.participantes.map((p, idx) => `
    <tr class="ranking-row" data-idx="${idx}">
      <td class="rank-pos">${medalla(p.rank)}</td>
      <td><b>${esc(p.nombre)}</b>${p.premio_especial ? " 🎯" : ""}</td>
      <td class="num rank-puntos">${p.puntos}</td>
      <td class="num muted">${p.max_posible}</td>
      <td class="num rank-premio">${p.premio_eur ? fmtEUR(p.premio_eur) : "—"}</td>
    </tr>
    <tr class="desglose hidden" id="desglose-${idx}"><td colspan="5">${desgloseHTML(p)}</td></tr>`).join("");

  $("ranking").innerHTML = `
    <h2>🏅 Clasificación general</h2>
    <p class="muted small">Toca una fila para ver el desglose pregunta a pregunta. "Máx" es lo que aún puede llegar a sumar cada uno.</p>
    <div class="table-scroll"><table>
      <thead><tr><th></th><th>Tralloso</th><th class="num">Puntos</th><th class="num">Máx</th><th class="num">Premio</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  document.querySelectorAll(".ranking-row").forEach((tr) => {
    tr.addEventListener("click", () => $(`desglose-${tr.dataset.idx}`).classList.toggle("hidden"));
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

  ctx.strokeStyle = "#28345e"; ctx.fillStyle = "#8c97b8"; ctx.font = "10px Sora";
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
    lm.innerHTML = `<div class="card"><h2>🔴 En vivo</h2><p class="muted">Ahora mismo no hay ningún partido en juego. Cuando lo haya, aquí verás el marcador y cómo afectaría al ranking si acabara así.</p></div>`;
  }

  const lb = D.standings.live;
  if (lb && live.length) {
    ls.innerHTML = `<div class="card">
      <h2>⚡ Ranking provisional (si los partidos acaban así)</h2>
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

  const proximos = D.matches.matches
    .filter((m) => !m.finished && !m.live)
    .sort((a, b) => a.utc.localeCompare(b.utc))
    .slice(0, 8);
  px.innerHTML = `<div class="card"><h2>📅 Próximos partidos</h2>
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

function renderPredicciones() {
  const ps = D.predictions.participantes;
  if (!ps.length) {
    $("predicciones-tabla").innerHTML = '<p class="muted">Aún no hay respuestas.</p>';
    return;
  }
  $("predicciones-tabla").innerHTML = `<table>
    <thead><tr><th>Tralloso</th><th>Campeón</th><th>Subcampeón</th><th>Pichichi</th>
      <th>España llega a</th><th>Revelación</th><th>Decepción</th><th>Final</th></tr></thead>
    <tbody>${ps.map((p, i) => `
      <tr>
        <td class="pred-nombre" data-idx="${i}">${esc(p.nombre)}</td>
        <td><span class="pred-pill">${esc(p.q1)}</span></td>
        <td><span class="pred-pill">${esc(p.q2)}</span></td>
        <td>${esc(p.q5)}</td>
        <td><span class="pred-pill">${esc(p.q8)}</span></td>
        <td>${esc(p.q6)}</td>
        <td>${esc(p.q7)}</td>
        <td class="small">${esc(p.q13)}</td>
      </tr>`).join("")}</tbody>
  </table>`;
  document.querySelectorAll(".pred-nombre").forEach((td) => {
    td.addEventListener("click", () => showFicha(ps[td.dataset.idx]));
  });
}

function showFicha(p) {
  const grupos = Object.keys(p.grupos || {}).sort().map((L) =>
    `<tr><td>Grupo ${L}</td><td>${esc(p.grupos[L]["1"])}</td><td>${esc(p.grupos[L]["2"])}</td></tr>`).join("");
  $("modal-body").innerHTML = `
    <h2>🔮 La porra de ${esc(p.nombre)}</h2>
    <table>
      <tr><td>Campeón</td><td colspan="2"><b>${esc(p.q1)}</b></td></tr>
      <tr><td>Subcampeón</td><td colspan="2">${esc(p.q2)}</td></tr>
      <tr><td>Semifinalistas</td><td colspan="2">${esc((p.q3 || []).join(", "))}</td></tr>
      <tr><td>Cuartofinalistas</td><td colspan="2" class="small">${esc((p.q4 || []).join(", "))}</td></tr>
      <tr><td>Pichichi</td><td colspan="2">${esc(p.q5)}</td></tr>
      <tr><td>Revelación / Decepción</td><td colspan="2">${esc(p.q6)} / ${esc(p.q7)}</td></tr>
      <tr><td>España llega a</td><td colspan="2">${esc(p.q8)} · ¿Gana su grupo? ${esc(p.q9)}</td></tr>
      <tr><td>Goleador de España / primero</td><td colspan="2">${esc(p.q10)} / ${esc(p.q12)}</td></tr>
      <tr><td>Goles de España</td><td colspan="2">${esc(p.q11)}</td></tr>
      <tr><th>Grupos</th><th>1º</th><th>2º</th></tr>
      ${grupos}
      <tr><td>Final</td><td colspan="2"><b>${esc(p.q13)}</b> · gana ${esc(p.q14)}</td></tr>
      <tr><td>¿Penaltis? / ¿Roja?</td><td colspan="2">${esc(p.q15)} / ${esc(p.q16)}</td></tr>
      <tr><td>Minuto primer gol final</td><td colspan="2">${esc(p.q17)}</td></tr>
    </table>`;
  $("modal").classList.remove("hidden");
}

/* ---------------- arranque ---------------- */

function buildCrestMap() {
  for (const m of D.matches.matches) {
    if (m.home && m.home_crest) crest[m.home] = m.home_crest;
    if (m.away && m.away_crest) crest[m.away] = m.away_crest;
  }
}

function renderAll() {
  buildCrestMap();
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
