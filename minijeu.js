// minijeu.js : course de voitures au tap, affichée sur le bandeau (page admin).
// Le serveur gère les inscriptions, le tirage des 4 joueurs et les taps ; cette page ne fait qu'afficher.
// Pendant la course : photos, annonces, direct caméra et bandeau défilant sont masqués, les nouvelles photos attendent.
(function () {
  if (typeof SERVER_URL === "undefined" || typeof ADMIN_PASS === "undefined") return;

  const CAR_SVG = '<svg viewBox="0 0 200 72" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor" stroke="#fff" stroke-width="2" stroke-linejoin="round">' +
    '<rect x="4" y="12" width="36" height="6" rx="2"/><rect x="15" y="18" width="4" height="14"/>' +
    '<path d="M6 54 L6 38 L16 31 L42 29 L72 15 L106 12 L136 26 L176 33 L194 41 L197 50 L190 55 L174 55 A16 16 0 0 0 142 55 L61 55 A16 16 0 0 0 29 55 Z"/>' +
    '<path d="M75 18 L104 15 L127 27 L77 28 Z" fill="#1a1a1a"/></g>' +
    '<circle cx="45" cy="57" r="12" fill="#111" stroke="#fff" stroke-width="2"/><circle cx="45" cy="57" r="5" fill="#bbb"/>' +
    '<circle cx="158" cy="57" r="12" fill="#111" stroke="#fff" stroke-width="2"/><circle cx="158" cy="57" r="5" fill="#bbb"/></svg>';

  const css = document.createElement("style");
  css.textContent = `
    #game-layer { position: absolute; left: 460px; right: 384px; top: 0; bottom: 0; z-index: 32; background: #15151b; opacity: 0; pointer-events: none; transition: opacity 0.5s ease; overflow: hidden; font-family: 'Arial Black', 'Helvetica Neue', Arial, sans-serif; }
    #game-layer.show { opacity: 1; }
    body.game-on #announce, body.game-on #ticker, body.game-on #winner-layer, body.game-on #logo-full, body.game-on #idle-text,
    body.game-on #photo-zone, body.game-on #effect-layer, body.game-on #live-layer, body.game-on #game-banner { opacity: 0 !important; visibility: hidden !important; }
    #game-talk { height: 44px; display: flex; align-items: center; justify-content: center; color: #ffd60a; font-size: 30px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; background: #0c0c10; white-space: nowrap; }
    #game-talk.pop { animation: game-pop 0.5s cubic-bezier(0.2, 1.4, 0.4, 1); }
    @keyframes game-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    #game-lanes { position: absolute; top: 44px; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; }
    .g-lane { position: relative; flex: 1; border-bottom: 3px dashed #444; }
    .g-lane:nth-child(odd) { background: #1d1d25; }
    .g-lane:nth-child(even) { background: #23232c; }
    .g-name { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 220px; font-size: 38px; font-weight: 900; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .g-finish { position: absolute; right: 40px; top: 0; bottom: 0; width: 24px; background: repeating-conic-gradient(#000 0 25%, #fff 0 50%) 0 0 / 24px 24px; }
    .g-car { position: absolute; left: 0; top: 50%; width: 190px; height: 68px; margin-top: -34px; transition: transform 0.3s linear; }
    .g-car svg { width: 100%; height: 100%; display: block; }
    .g-car.lead { filter: drop-shadow(0 0 10px currentColor); }
    #game-cd { position: absolute; top: 44px; left: 250px; right: 0; bottom: 0; display: none; align-items: center; justify-content: center; gap: 60px; background: rgba(10,10,14,0.72); }
    #game-cd.show { display: flex; }
    #game-lights { display: flex; gap: 22px; padding: 18px 26px; background: #050505; border-radius: 14px; border: 3px solid #333; }
    #game-lights i { width: 62px; height: 62px; border-radius: 50%; background: #2a2a2a; display: block; }
    #game-lights i.red { background: #ff1e1e; box-shadow: 0 0 26px #ff1e1e; }
    #game-lights i.green { background: #30ff6a; box-shadow: 0 0 30px #30ff6a; }
    #game-num { font-size: 150px; font-weight: 900; color: #fff; min-width: 200px; text-align: center; text-shadow: 0 6px 30px rgba(0,0,0,0.8); }
    #game-num.go { color: #30ff6a; }
    #game-podium { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: flex-start; background: radial-gradient(circle at 50% 30%, #3a1466 0%, #0c0c10 75%); }
    #game-podium.show { display: flex; }
    #game-podium h2 { margin: 18px 0 10px; color: #ffd60a; font-size: 44px; letter-spacing: 3px; text-transform: uppercase; white-space: nowrap; }
    #game-steps { display: flex; align-items: flex-end; gap: 30px; }
    .g-step { width: 300px; display: flex; flex-direction: column; align-items: center; }
    .g-step .g-car { position: static; margin: 0; transform: none; width: 160px; height: 58px; }
    .g-step .g-pname { font-size: 34px; font-weight: 900; text-transform: uppercase; margin: 4px 0; white-space: nowrap; }
    .g-step .g-block { width: 100%; background: linear-gradient(180deg, #3b3b48, #23232c); border: 3px solid #555; border-bottom: none; border-radius: 10px 10px 0 0; display: flex; justify-content: center; padding-top: 6px; font-size: 52px; }
    #game-banner { position: absolute; left: 0; bottom: 0; width: 460px; z-index: 33; background: rgba(0,0,0,0.82); border-top: 4px solid #ffd60a; border-right: 4px solid #ffd60a; border-radius: 0 14px 0 0; padding: 8px 14px; font-family: 'Arial Black', 'Helvetica Neue', Arial, sans-serif; display: none; }
    #game-banner.show { display: block; }
    #game-banner b { display: block; color: #ffd60a; font-size: 30px; font-weight: 900; text-transform: uppercase; white-space: nowrap; }
    #game-banner span { display: block; color: #fff; font-size: 19px; font-weight: 700; white-space: nowrap; }
  `;
  document.head.appendChild(css);

  const stage = document.getElementById("stage");
  const layer = document.createElement("div");
  layer.id = "game-layer";
  layer.innerHTML = '<div id="game-talk"></div><div id="game-lanes"></div>' +
    '<div id="game-cd"><div id="game-lights"><i></i><i></i><i></i><i></i><i></i></div><div id="game-num"></div></div>' +
    '<div id="game-podium"><h2 id="game-podium-title"></h2><div id="game-steps"></div></div>';
  stage.appendChild(layer);
  const banner = document.createElement("div");
  banner.id = "game-banner";
  banner.innerHTML = '<b id="game-banner-title"></b><span id="game-banner-sub"></span>';
  stage.appendChild(banner);
  const $g = (id) => document.getElementById(id);

  // Pendant la course, les photos en attente ne s'affichent pas (elles restent dans la file)
  let gameOn = false;
  const origProcess = window.processQueue;
  if (typeof origProcess === "function") {
    window.processQueue = function () { if (gameOn) return; return origProcess.apply(this, arguments); };
  }
  function setGameOn(on) {
    if (on === gameOn) return;
    gameOn = on;
    document.body.classList.toggle("game-on", on);
    layer.classList.toggle("show", on);
    if (!on) setTimeout(() => { try { window.processQueue(); } catch (e) {} }, 600);
  }

  // --- Commentaires en direct ---
  let talkLast = 0, talkTimer = null;
  function talk(msg, force) {
    const now = Date.now();
    const el = $g("game-talk");
    if (!force && now - talkLast < 1600) {
      clearTimeout(talkTimer);
      talkTimer = setTimeout(() => talk(msg, true), 1600 - (now - talkLast));
      return;
    }
    clearTimeout(talkTimer);
    talkLast = now;
    el.textContent = msg;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }

  // --- Pistes ---
  let builtFor = 0;
  let race = null; // mémoire des commentaires pour la course en cours
  function buildLanes(d) {
    builtFor = d.id;
    const lanes = $g("game-lanes");
    lanes.innerHTML = "";
    d.players.forEach((p, i) => {
      const lane = document.createElement("div");
      lane.className = "g-lane";
      lane.innerHTML = '<div class="g-name"></div><div class="g-finish"></div><div class="g-car" id="g-car-' + i + '">' + CAR_SVG + "</div>";
      lane.querySelector(".g-name").textContent = p.name;
      lane.querySelector(".g-name").style.color = p.color;
      lane.querySelector(".g-car").style.color = p.color;
      lanes.appendChild(lane);
    });
    race = { leader: -1, wasLast: {}, final: false, close: 0 };
    $g("game-talk").textContent = "Mini-jeu : la course va commencer !";
  }
  function moveCars(d) {
    const w = layer.clientWidth || 1844;
    const startX = 250, endX = w - 40 - 190;
    d.players.forEach((p, i) => {
      const car = $g("g-car-" + i);
      if (!car) return;
      const x = startX + (endX - startX) * Math.min(1, p.taps / d.finish);
      car.style.transform = `translateX(${x}px)`;
    });
  }

  function commentate(d) {
    if (!race || d.phase !== "race") return;
    const ps = d.players;
    if (ps.length < 2) return;
    const order = ps.map((p, i) => i).sort((a, b) => ps[b].taps - ps[a].taps);
    const lead = order[0], second = order[1], last = order[order.length - 1];
    const maxTaps = ps[lead].taps;
    ps.forEach((p, i) => $g("g-car-" + i) && $g("g-car-" + i).classList.toggle("lead", i === lead && maxTaps > 0));
    if (maxTaps >= 8 && ps[last].taps < maxTaps - 6) race.wasLast[last] = true;
    if (maxTaps > 5 && lead !== race.leader && ps[lead].taps > ps[second].taps) {
      const comeback = race.wasLast[lead] && race.leader !== -1;
      talk(comeback ? `Remontée incroyable de ${ps[lead].name} !` : `${ps[lead].name} prend la tête !`);
      race.leader = lead;
      race.wasLast = {};
      return;
    }
    if (!race.final && maxTaps >= d.finish * 0.8) { race.final = true; talk("Dernière ligne droite !"); return; }
    if (maxTaps > d.finish * 0.4 && ps[lead].taps - ps[second].taps <= 2 && Date.now() - race.close > 5000) {
      race.close = Date.now();
      talk(`Coude à coude entre ${ps[lead].name} et ${ps[second].name} !`);
    }
  }

  function showCountdown(d, offset) {
    const left = Math.ceil((d.goAt - (Date.now() + offset)) / 1000);
    const cd = $g("game-cd"), num = $g("game-num");
    const lights = [...document.querySelectorAll("#game-lights i")];
    cd.classList.add("show");
    num.classList.remove("go");
    if (left > 5) { lights.forEach(l => (l.className = "")); num.textContent = left; }
    else if (left >= 1) { lights.forEach((l, i) => (l.className = i < 6 - left ? "red" : "")); num.textContent = left; }
  }
  let goShownFor = 0;
  function showGo(id) {
    if (goShownFor === id) return;
    goShownFor = id;
    document.querySelectorAll("#game-lights i").forEach(l => (l.className = "green"));
    const num = $g("game-num");
    num.textContent = "GO !";
    num.classList.add("go");
    $g("game-cd").classList.add("show");
    talk("C'est parti !", true);
    setTimeout(() => $g("game-cd").classList.remove("show"), 1200);
  }

  let podiumFor = 0;
  function showPodium(d) {
    if (podiumFor === d.id) return;
    podiumFor = d.id;
    $g("game-cd").classList.remove("show");
    const pod = $g("game-podium");
    $g("game-podium-title").textContent = d.podium.length ? `🏁 Victoire de ${d.podium[0].name} ! 🏆` : "Course terminée";
    const steps = $g("game-steps");
    steps.innerHTML = "";
    const H = { 1: 150, 2: 105, 3: 70 }, MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
    [2, 1, 3].forEach(place => {
      const p = d.podium.find(x => x.place === place);
      if (!p) return;
      const step = document.createElement("div");
      step.className = "g-step";
      step.innerHTML = '<div class="g-car">' + CAR_SVG + '</div><div class="g-pname"></div><div class="g-block"></div>';
      step.querySelector(".g-car").style.color = p.color;
      step.querySelector(".g-pname").textContent = p.name;
      step.querySelector(".g-pname").style.color = p.color;
      step.querySelector(".g-block").style.height = H[place] + "px";
      step.querySelector(".g-block").textContent = MEDAL[place];
      steps.appendChild(step);
    });
    pod.classList.add("show");
  }

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function render(d) {
    const offset = d.now - Date.now();
    // petit encart en bas à gauche pendant les inscriptions (l'écran reste normal)
    if (d.phase === "signup") {
      banner.classList.add("show");
      $g("game-banner-title").textContent = d.signupEndsAt ? "🏁 Mini-jeu dans " + fmt(d.signupEndsAt - (Date.now() + offset)) : "🏁 Mini-jeu : inscris-toi !";
      $g("game-banner-sub").textContent = "Flashe le QR code · " + d.signups + " inscrit" + (d.signups > 1 ? "s" : "");
    } else banner.classList.remove("show");

    const active = ["countdown", "race", "result"].includes(d.phase);
    setGameOn(active);
    if (!active) { $g("game-podium").classList.remove("show"); $g("game-cd").classList.remove("show"); return; }
    if (builtFor !== d.id) buildLanes(d);
    if (d.phase === "countdown") { $g("game-podium").classList.remove("show"); showCountdown(d, offset); moveCars(d); }
    else if (d.phase === "race") { showGo(d.id); moveCars(d); commentate(d); }
    else if (d.phase === "result") { moveCars(d); setTimeout(() => showPodium(d), 900); }
  }

  // --- Panneau de commande dans la page admin ---
  const panel = document.createElement("div");
  panel.className = "cpanel";
  panel.id = "game-panel";
  panel.innerHTML = '<h3>Mini-jeu : course de voitures</h3>' +
    '<div class="line"><span id="game-status">…</span></div>' +
    '<div class="line"><span>Départ auto dans</span><input type="number" id="game-min" value="5" min="0" max="60" style="width:70px;"><span>min (0 = sans minuteur)</span>' +
    '<button id="game-open">Ouvrir les inscriptions</button></div>' +
    '<div class="line"><button id="game-start">Lancer la course maintenant</button><button id="game-stop">Arrêter le mini-jeu</button>' +
    '<button id="game-stats">Statistiques de la soirée</button></div>';
  const panels = document.getElementById("panels");
  if (panels) panels.prepend(panel);
  async function act(a, extra) {
    try {
      const q = new URLSearchParams({ a, p: ADMIN_PASS, ...(extra || {}) });
      const r = await fetch(`${SERVER_URL}/api/game/admin?${q}`, { method: "POST" });
      const d = await r.json();
      if (d.error) alert(d.error);
      render(d);
      status(d);
    } catch (e) { alert("Serveur injoignable"); }
  }
  $g("game-open").addEventListener("click", () => act("open", { min: $g("game-min").value || 0 }));
  $g("game-start").addEventListener("click", () => act("start"));
  $g("game-stop").addEventListener("click", () => { if (confirm("Arrêter le mini-jeu et effacer les inscrits ?")) act("stop", { clear: 1 }); });
  $g("game-stats").addEventListener("click", () => window.open("stats.html", "_blank"));
  function status(d) {
    const offset = d.now - Date.now();
    const txt = {
      off: "Fermé",
      signup: "Inscriptions ouvertes" + (d.signupEndsAt ? " · départ auto dans " + fmt(d.signupEndsAt - (Date.now() + offset)) : ""),
      countdown: "Départ imminent", race: "Course en cours", result: "Podium affiché"
    }[d.phase] || d.phase;
    $g("game-status").textContent = txt + " · " + d.signups + " inscrit" + (d.signups > 1 ? "s" : "") + (d.notice ? " · " + d.notice : "");
  }

  // --- Lecture de l'état : rapide pendant la course, plus lente sinon ---
  let fast = false;
  async function poll() {
    try {
      const r = await fetch(`${SERVER_URL}/api/game`);
      const d = await r.json();
      fast = ["countdown", "race"].includes(d.phase);
      render(d);
      status(d);
    } catch (e) {}
    setTimeout(poll, fast ? 250 : 1000);
  }
  poll();
})();
