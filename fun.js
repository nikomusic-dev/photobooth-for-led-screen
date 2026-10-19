// Participation du public sur l'écran LED : emojis flottants, vote en direct, jauge d'ambiance.
// Chargé par admin.html (utilise SERVER_URL et ADMIN_PASS déjà définis dedans).
(function () {
  const stage = document.getElementById("stage");
  if (!stage) return;

  const css = document.createElement("style");
  css.textContent = `
  #fun-layer { position: absolute; left: 460px; top: 0; width: 1844px; height: 384px; overflow: hidden; pointer-events: none; z-index: 29; }
  .fun-emoji { position: absolute; bottom: -120px; line-height: 1; will-change: transform, opacity; animation: fun-rise var(--d) ease-out forwards; text-shadow: 0 0 18px rgba(0,0,0,0.5); }
  @keyframes fun-rise {
    0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
    10% { opacity: 1; transform: translate(0, -40px) scale(1); }
    50% { transform: translate(var(--dx), -250px) scale(1.05); }
    100% { transform: translate(calc(var(--dx) * -0.6), -560px) scale(0.9); opacity: 0; }
  }
  #fun-poll { position: absolute; left: 460px; top: 0; width: 1844px; height: 384px; box-sizing: border-box; padding: 14px 60px 0; background: rgba(8,0,24,0.93); color: #fff; z-index: 24; display: none; font-family: -apple-system, 'Segoe UI', sans-serif; }
  #fun-poll .q { font-size: 46px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; text-align: center; color: #ffd60a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #fun-poll .hint { text-align: center; font-size: 22px; letter-spacing: 4px; color: #aaa; margin: 2px 0 12px; text-transform: uppercase; }
  #fun-poll .row { position: relative; height: 52px; margin-bottom: 8px; border-radius: 12px; background: rgba(255,255,255,0.08); overflow: hidden; }
  #fun-poll .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, #ff4d8d, #ff9500); transition: width 0.6s ease; }
  #fun-poll .row.win .fill { background: linear-gradient(90deg, #34c759, #a6ff4d); }
  #fun-poll .lab { position: absolute; left: 22px; top: 0; bottom: 0; display: flex; align-items: center; font-size: 32px; font-weight: 800; text-transform: uppercase; }
  #fun-poll .val { position: absolute; right: 22px; top: 0; bottom: 0; display: flex; align-items: center; font-size: 32px; font-weight: 900; }
  #fun-meter { position: absolute; left: 460px; bottom: 0; width: 1844px; height: 22px; background: rgba(0,0,0,0.55); z-index: 28; opacity: 0; transition: opacity 0.6s; pointer-events: none; }
  #fun-meter .fill { height: 100%; width: 0; background: linear-gradient(90deg, #34c759, #ffd60a, #ff3b30); transition: width 0.3s; }
  #fun-meter .tag { position: absolute; left: 14px; top: 0; line-height: 22px; font-size: 15px; font-weight: 900; letter-spacing: 3px; color: #fff; text-shadow: 0 0 6px #000; z-index: 1; }
  `;
  document.head.appendChild(css);

  const layer = document.createElement("div"); layer.id = "fun-layer";
  const pollEl = document.createElement("div"); pollEl.id = "fun-poll";
  const meter = document.createElement("div"); meter.id = "fun-meter";
  meter.innerHTML = '<div class="tag">🔥 AMBIANCE</div><div class="fill"></div>';
  stage.appendChild(pollEl); stage.appendChild(layer); stage.appendChild(meter);

  let lastId = -1, recent = [], lastActivity = 0, reactionsOn = true, lastPoll = "";

  function floatEmoji(e) {
    if (layer.childElementCount > 70) return;
    const el = document.createElement("div");
    el.className = "fun-emoji";
    el.textContent = e;
    el.style.left = (40 + Math.random() * 1700) + "px";
    el.style.fontSize = (60 + Math.random() * 60) + "px";
    el.style.setProperty("--d", (3.6 + Math.random() * 1.6) + "s");
    el.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
    layer.appendChild(el);
    setTimeout(() => el.remove(), 5500);
  }

  function renderPoll(p) {
    const j = JSON.stringify(p);
    if (j === lastPoll) return;
    lastPoll = j;
    if (!p) { pollEl.style.display = "none"; return; }
    const total = p.votes.reduce((a, b) => a + b, 0);
    const max = Math.max.apply(null, p.votes);
    pollEl.style.display = "block";
    pollEl.innerHTML = "";
    const q = document.createElement("div"); q.className = "q"; q.textContent = p.question || "Votez !";
    const h = document.createElement("div"); h.className = "hint";
    h.textContent = p.open ? "Scanne le QR · Réagir & voter  (" + total + " vote" + (total > 1 ? "s" : "") + ")" : "Résultat final · " + total + " vote" + (total > 1 ? "s" : "");
    pollEl.appendChild(q); pollEl.appendChild(h);
    p.options.forEach((o, i) => {
      const pct = total ? Math.round(p.votes[i] * 100 / total) : 0;
      const row = document.createElement("div");
      row.className = "row" + (!p.open && max > 0 && p.votes[i] === max ? " win" : "");
      row.innerHTML = '<div class="fill"></div><div class="lab"></div><div class="val"></div>';
      row.querySelector(".lab").textContent = o;
      row.querySelector(".val").textContent = pct + "%";
      pollEl.appendChild(row);
      requestAnimationFrame(() => requestAnimationFrame(() => { row.querySelector(".fill").style.width = pct + "%"; }));
    });
  }

  async function tick() {
    try {
      const d = await (await fetch(SERVER_URL + "/api/fun-feed?after=" + (lastId < 0 ? 999999999 : lastId))).json();
      if (lastId < 0) lastId = d.last;
      else {
        reactionsOn = d.reactionsOn;
        d.reactions.forEach((r, i) => { setTimeout(() => floatEmoji(r.e), i * 60); recent.push(Date.now()); });
        if (d.reactions.length) lastActivity = Date.now();
        lastId = d.last;
      }
      renderPoll(d.poll);
    } catch (e) {}
  }
  setInterval(tick, 800);
  tick();

  // Jauge d'ambiance : nombre de réactions sur les 5 dernières secondes
  setInterval(() => {
    const now = Date.now();
    recent = recent.filter(t => now - t < 5000);
    const level = Math.min(1, recent.length / 40);
    meter.querySelector(".fill").style.width = (level * 100) + "%";
    meter.style.opacity = (now - lastActivity < 6000 && reactionsOn) ? 1 : 0;
  }, 300);

  // Petit panneau de contrôle dans la page admin (la télécommande fait la même chose)
  const panels = document.getElementById("panels");
  if (panels) {
    const pn = document.createElement("div");
    pn.className = "cpanel";
    pn.innerHTML = '<h3>Participation du public</h3>' +
      '<button id="fun-on">Réactions : ON</button><button id="fun-off">Réactions : OFF</button>' +
      '<input id="fun-q" type="text" maxlength="60" placeholder="Question du vote">' +
      '<input id="fun-o" type="text" placeholder="Choix séparés par une virgule (2 à 4)">' +
      '<button id="fun-start">Lancer le vote</button><button id="fun-stop">Clôturer</button><button id="fun-clear">Effacer</button>';
    panels.appendChild(pn);
    const call = (a, extra) => {
      const p = new URLSearchParams(Object.assign({ a: a, p: ADMIN_PASS }, extra || {}));
      return fetch(SERVER_URL + "/api/fun-admin?" + p, { method: "POST" }).catch(() => {});
    };
    pn.querySelector("#fun-on").onclick = () => call("react_on");
    pn.querySelector("#fun-off").onclick = () => call("react_off");
    pn.querySelector("#fun-start").onclick = () => call("poll_start", { q: pn.querySelector("#fun-q").value, o: pn.querySelector("#fun-o").value.split(",").join("|") });
    pn.querySelector("#fun-stop").onclick = () => call("poll_stop");
    pn.querySelector("#fun-clear").onclick = () => call("poll_clear");
  }
})();
