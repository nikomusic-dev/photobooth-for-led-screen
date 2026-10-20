// live.js : Direct caméra. Reçoit la vidéo WebRTC du téléphone et l'affiche en 16:9 au centre du bandeau.
// Pendant le direct : photos, annonces, texte à l'écran et bandeau défilant sont masqués,
// les nouvelles photos attendent leur tour. À la fin du direct, tout reprend.
(function () {
  if (typeof SERVER_URL === "undefined" || typeof ADMIN_PASS === "undefined") return;

  // Si le direct ne se connecte pas sur certains réseaux, ajouter ici un serveur TURN :
  // { urls: "turn:mon-serveur:3478", username: "...", credential: "..." }
  const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

  const css = document.createElement("style");
  css.textContent = `
    #live-layer { position: absolute; left: 384px; top: 0; width: 1920px; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 29; opacity: 0; pointer-events: none; transition: opacity 0.5s ease; }
    #live-layer.show { opacity: 1; }
    #live-video { height: calc(100% - 8px); aspect-ratio: 21 / 9; background: #000; object-fit: cover; border-radius: 6px; box-shadow: 0 0 0 4px #fff, 0 10px 40px rgba(0,0,0,0.7); }
    body.live-on #announce, body.live-on #ticker, body.live-on #winner-layer, body.live-on #logo-full,
    body.live-on #idle-text, body.live-on #photo-zone, body.live-on #effect-layer { opacity: 0 !important; visibility: hidden !important; }
    .lamp-pill { display: flex; align-items: center; gap: 10px; background: #19191b; border: 1px solid #0a0a0a; border-radius: 5px; padding: 10px 16px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.6); text-transform: uppercase; font-size: 11px; letter-spacing: 0.4px; color: #999; }
    .lamp-pill i { width: 14px; height: 14px; border-radius: 50%; background: #666; display: inline-block; }
    .lamp-pill i.green { background: #34c759; box-shadow: 0 0 10px #34c759; }
    .lamp-pill i.orange { background: #ff9f0a; box-shadow: 0 0 10px #ff9f0a; }
    .lamp-pill i.red { background: #ff453a; box-shadow: 0 0 10px #ff453a; }
  `;
  document.head.appendChild(css);

  // Voyants dans la barre de commandes (hors du bandeau, donc jamais visibles sur l'écran LED)
  function makePill(text) {
    const pill = document.createElement("div");
    pill.className = "lamp-pill";
    const dot = document.createElement("i");
    const label = document.createElement("span");
    label.textContent = text;
    pill.append(dot, label);
    const bar = document.getElementById("toolbar");
    if (bar) bar.appendChild(pill);
    return (color, txt) => { dot.className = color; label.textContent = txt; };
  }
  const setLiveLamp = makePill("Direct caméra : arrêté");
  const setRemoteLamp = makePill("Télécommande : ?");
  setLiveLamp("red", "Direct caméra : arrêté");

  const stage = document.getElementById("stage");
  const layer = document.createElement("div");
  layer.id = "live-layer";
  const video = document.createElement("video");
  video.id = "live-video";
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  layer.appendChild(video);
  stage.appendChild(layer);

  // Pendant le direct, les photos en attente ne s'affichent pas
  let liveOn = false;
  const origProcess = window.processQueue;
  if (typeof origProcess === "function") {
    window.processQueue = function () { if (liveOn) return; return origProcess.apply(this, arguments); };
  }

  function enter() {
    liveOn = true;
    document.body.classList.add("live-on");
    layer.classList.add("show");
  }
  function exit() {
    if (!liveOn) return;
    liveOn = false;
    document.body.classList.remove("live-on");
    layer.classList.remove("show");
    setTimeout(() => { if (!liveOn) { video.srcObject = null; try { window.processQueue(); } catch (e) {} } }, 500);
  }
  // L'image s'affiche seulement quand la première image vidéo est là (pas d'écran noir)
  video.addEventListener("playing", () => { if (pc) enter(); });

  let pc = null, sid = null, lost = null, out = Promise.resolve();

  function send(type, data, s) {
    const q = new URLSearchParams({ to: "phone", type, sid: s, p: ADMIN_PASS });
    out = out.then(() => fetch(`${SERVER_URL}/api/live/send?${q}`, { method: "POST", body: data || "" })).catch(() => {});
  }

  function close() {
    clearTimeout(lost);
    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    sid = null;
    exit();
  }

  async function onOffer(m) {
    close();
    const mySid = m.sid;
    sid = mySid;
    const p = new RTCPeerConnection({ iceServers: ICE });
    pc = p;
    p.ontrack = (e) => {
      video.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      video.play().catch(() => {});
    };
    p.onicecandidate = (e) => { if (e.candidate && pc === p) send("ice", JSON.stringify(e.candidate), mySid); };
    p.onconnectionstatechange = () => {
      if (pc !== p) return;
      clearTimeout(lost);
      if (p.connectionState === "failed" || p.connectionState === "closed") close();
      else if (p.connectionState === "disconnected") lost = setTimeout(() => { if (pc === p) close(); }, 6000);
    };
    await p.setRemoteDescription(JSON.parse(m.data));
    await p.setLocalDescription(await p.createAnswer());
    send("answer", JSON.stringify(p.localDescription), mySid);
  }

  let lastId = null, busy = false;
  async function poll() {
    if (busy) return;
    busy = true;
    try {
      const res = await fetch(`${SERVER_URL}/api/live/recv?for=admin&after=${lastId || 0}&p=${encodeURIComponent(ADMIN_PASS)}`);
      const data = await res.json();
      // première lecture (ou serveur redémarré) : on ignore les anciens messages
      if (lastId === null || data.last < lastId) { lastId = data.last; return; }
      for (const m of data.msgs) {
        lastId = m.id;
        if (m.type === "offer") await onOffer(m);
        else if (m.type === "stop") { if (!sid || m.sid === sid || m.sid === "*") close(); }
        else if (m.type === "ice" && pc && m.sid === sid) { try { await pc.addIceCandidate(JSON.parse(m.data)); } catch (e) {} }
      }
      lastId = Math.max(lastId, data.last);
    } catch (e) {
    } finally {
      busy = false;
    }
  }
  setInterval(poll, 500);

  // Voyant du direct : vert = image qui avance, orange = connexion en cours / image figée, rouge = arrêté
  let lastT = -1, lastChange = Date.now();
  setInterval(() => {
    if (!pc) { setLiveLamp("red", "Direct caméra : arrêté"); lastT = -1; return; }
    const st = pc.connectionState;
    if (video.currentTime !== lastT) { lastT = video.currentTime; lastChange = Date.now(); }
    if (st === "disconnected") setLiveLamp("orange", "Direct : connexion perdue");
    else if (!liveOn) setLiveLamp("orange", "Direct : connexion...");
    else if (Date.now() - lastChange > 2500) setLiveLamp("orange", "Direct : image figée");
    else setLiveLamp("green", "Direct caméra : en cours");
  }, 1000);

  // Voyant télécommande : combien de téléphones / régies PC sont connectés en ce moment
  async function checkRemotes() {
    try {
      const res = await fetch(`${SERVER_URL}/api/remotes?p=${encodeURIComponent(ADMIN_PASS)}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      const extra = d.regie ? " · régie PC " + d.regie : "";
      if (d.remote > 0) setRemoteLamp("green", "Télécommande : " + d.remote + " connectée" + (d.remote > 1 ? "s" : "") + extra);
      else setRemoteLamp("red", "Télécommande : aucune" + extra);
    } catch (e) { setRemoteLamp("orange", "Télécommande : serveur ?"); }
  }
  setInterval(checkRemotes, 2000);
  checkRemotes();
})();
