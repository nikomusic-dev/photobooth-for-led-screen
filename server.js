const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");

const app = express();
const PORT = process.env.PORT || 3000;

// Dossier de stockage des photos
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

app.use(cors());
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + ".jpg");
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 } // 8 Mo max par photo
});

// Mémoire simple en RAM pour la liste des photos (suffisant pour un usage ponctuel en soirée)
let photos = [];

// --- Modération du texte (gros mots, insultes) ---
const collapse = (w) => w.replace(/(.)\1+/g, "$1");

// Mots détectés seulement s'ils sont écrits seuls (évite les faux positifs : "technique", "computer"...)
const BLOCKED_WORDS = [
  "con", "connard", "connasse", "conard", "cul", "pd", "fdp", "ntm", "tg", "bite", "zob",
  "couille", "couilles", "pute", "putes", "putain", "salope", "salopard", "encule", "enculer",
  "batard", "merde", "chier", "chiotte", "bordel", "nique", "niquer", "niquez", "baise",
  "suce", "sucer", "foutre", "pouffiasse", "gouine", "pede", "tapette", "negre", "negro",
  "bougnoule", "youpin", "raclure", "debile", "abruti", "cretin", "connerie",
  "fuck", "fucking", "shit", "bitch", "asshole", "pussy", "slut", "whore", "nigger", "nigga",
  "faggot", "cunt", "nazi", "pedophile", "pedo", "viol", "violeur"
];
const BLOCKED_SET = new Set(BLOCKED_WORDS.map(collapse));

// Mots longs et très distinctifs : détectés même collés à d'autres lettres ou espacés (p u t a i n)
const BLOCKED_SUBSTR = ["putain", "enculer", "encule", "connard", "connasse", "salope", "merde", "fuck", "nigger", "pedophile", "bitch"].map(collapse);

function normalizeText(t) {
  return t.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t")
    .replace(/@/g, "a").replace(/\$/g, "s");
}

function isCaptionAllowed(caption) {
  const norm = normalizeText(caption);
  const words = norm.split(/[^a-z]+/).filter(Boolean).map(collapse);
  if (words.some(w => BLOCKED_SET.has(w))) return false;
  const compact = collapse(norm.replace(/[^a-z]/g, ""));
  return !BLOCKED_SUBSTR.some(s => compact.includes(s));
}

// Réception d'une nouvelle photo depuis le téléphone
app.post("/api/photos", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucune photo reçue" });

  const caption = (req.body.caption || "").slice(0, 20);
  if (moderationEnabled && !isCaptionAllowed(caption)) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(422).json({ error: "caption_blocked" });
  }
  const photo = {
    id: req.file.filename,
    url: `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`,
    caption,
    createdAt: Date.now()
  };
  photos.push(photo);
  // on garde seulement les 200 dernières en mémoire
  if (photos.length > 200) photos = photos.slice(-200);

  res.json({ success: true, photo });
});

// Le PC récupère les photos récentes (30 dernières minutes par défaut)
app.get("/api/photos", (req, res) => {
  const since = Date.now() - 30 * 60 * 1000;
  const recent = photos.filter(p => p.createdAt >= since);
  res.json(recent);
});

// Suppression de toutes les photos (bouton "Purger" de la page admin)
app.delete("/api/photos", (req, res) => {
  const adminPass = process.env.ADMIN_PASS;
  if (adminPass && req.get("x-admin-pass") !== adminPass) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  photos = [];
  fs.readdirSync(UPLOAD_DIR).forEach(file => {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, file)); } catch (e) {}
  });
  res.json({ success: true });
});

// --- Téléphones connectés (estimation) : chaque page invité envoie un signal toutes les 10 s ---
const guestsSeen = new Map();
app.get("/api/ping", (req, res) => {
  const id = String(req.query.id || "").slice(0, 40);
  if (id) guestsSeen.set(id, Date.now());
  res.json({ ok: true, moderation: moderationEnabled });
});
app.get("/api/guests", (req, res) => {
  const now = Date.now();
  let count = 0;
  for (const [id, t] of guestsSeen) {
    if (now - t < 25000) count++;
    else if (now - t > 10 * 60 * 1000) guestsSeen.delete(id);
  }
  res.json({ count, moderation: moderationEnabled });
});

// --- Galerie : toutes les photos du dossier + un bouton "Tout télécharger" (ZIP) ---
function listPhotoFiles() {
  return fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith(".jpg")).sort();
}

app.get("/gallery", (req, res) => {
  const files = listPhotoFiles();
  const thumbs = files.map(f => `<a href="/uploads/${f}" target="_blank"><img src="/uploads/${f}" loading="lazy"></a>`).join("");
  res.send(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photos de la soirée</title>
<style>
  body { margin:0; background:#1c1c1e; color:#eee; font-family:-apple-system,Segoe UI,sans-serif; text-align:center; padding:24px; }
  h1 { font-size:22px; margin:0 0 6px; }
  p { color:#999; margin:0 0 20px; }
  .dl { display:inline-block; background:#ff4d8d; color:#fff; text-decoration:none; font-weight:700; padding:16px 36px; border-radius:8px; font-size:18px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; margin-top:28px; }
  .grid img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px; }
</style></head><body>
<h1>Photos de la soirée</h1>
<p>${files.length} photo(s)</p>
${files.length ? '<a class="dl" href="/api/photos.zip">Tout télécharger (ZIP)</a>' : "<p>Aucune photo pour le moment.</p>"}
<div class="grid">${thumbs}</div>
</body></html>`);
});

app.get("/api/photos.zip", (req, res) => {
  const files = listPhotoFiles();
  res.attachment("photos-soiree.zip");
  const archive = archiver("zip", { zlib: { level: 0 } });
  archive.on("error", () => res.end());
  archive.pipe(res);
  files.forEach(f => archive.file(path.join(UPLOAD_DIR, f), { name: f }));
  archive.finalize();
});

// --- Télécommande : le téléphone envoie des ordres, la page admin du PC les exécute ---
function isAdmin(req) {
  const pass = process.env.ADMIN_PASS;
  return !pass || req.query.p === pass || req.get("x-admin-pass") === pass;
}
let commands = [];
let commandSeq = 0;
let adminState = null;
const ALLOWED_COMMANDS = ["clear", "pause", "qr", "meme", "strobe_on", "strobe_off", "blackout", "test", "purge", "text_show", "text_clear", "duration",
  "promo", "announce_hide", "theme", "speed", "brightness", "replay", "approval", "celebrate", "remove_last", "winner",
  "logo_full", "clock", "countdown", "countdown_stop", "ticker", "ticker_stop", "qr2", "approve", "reject", "approve_all", "fx", "bgcolor", "promo_add", "promo_del", "qr2_set", "celebrate_n", "bggrad", "ann_style"];

app.post("/api/command", (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Non autorisé" });
  const { cmd, text, value } = req.query;
  if (!ALLOWED_COMMANDS.includes(cmd)) return res.status(400).json({ error: "Commande inconnue" });
  commands.push({ id: ++commandSeq, cmd, text: String(text || "").slice(0, 300), value: Number(value) || 0 });
  if (commands.length > 100) commands = commands.slice(-100);
  res.json({ success: true });
});

app.get("/api/commands", (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Non autorisé" });
  const after = parseInt(req.query.after, 10) || 0;
  res.json({ last: commandSeq, commands: commands.filter(c => c.id > after) });
});

// La page admin du PC envoie régulièrement son état (compteurs, boutons actifs...)
app.post("/api/state", express.text({ type: "*/*", limit: "50kb" }), (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Non autorisé" });
  try { adminState = { ...JSON.parse(req.body), updatedAt: Date.now() }; } catch (e) {}
  res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Non autorisé" });
  res.json({ state: adminState, now: Date.now(), moderation: moderationEnabled });
});

// --- Suppression d'une photo précise (photo refusée en validation manuelle) ---
app.post("/api/photo-delete", (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Non autorisé" });
  const id = String(req.query.id || "");
  if (!/^[0-9-]+\.jpg$/.test(id)) return res.status(400).json({ error: "id invalide" });
  photos = photos.filter(p => p.id !== id);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, id)); } catch (e) {}
  res.json({ success: true });
});

// --- Modération activable / désactivable (depuis la page admin ou la télécommande) ---
// Elle se réactive toute seule si le serveur redémarre.
let moderationEnabled = true;
app.post("/api/moderation", (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Non autorisé" });
  moderationEnabled = req.query.on !== "0";
  res.json({ moderation: moderationEnabled });
});

// --- Participation du public : emojis, vote, applaudimètre (aucun texte libre) ---
const FUN_EMOJIS = ["❤️", "😂", "🔥", "👏", "🎉", "😍", "🍺", "🤘"];
let reactionsOn = true;
let reactionSeq = 0;
let reactionLog = [];            // { id, e, t } : les 150 dernières réactions
let poll = null;                 // { id, question, options:[...], votes:[...], open }
let pollSeq = 0;
const pollVoters = new Map();    // guestId -> index du choix
const reactRate = new Map();     // guestId -> { n, t } (anti-spam : 12 taps / seconde max)

app.get("/api/fun", (req, res) => {
  res.json({ reactionsOn, emojis: FUN_EMOJIS, poll });
});

app.post("/api/react", (req, res) => {
  if (!reactionsOn) return res.json({ ok: false, off: true });
  const id = String(req.query.id || "").slice(0, 40);
  const e = String(req.query.e || "");
  const n = Math.min(Math.max(parseInt(req.query.n, 10) || 1, 1), 12);
  if (!id || !FUN_EMOJIS.includes(e)) return res.status(400).json({ ok: false });
  const now = Date.now();
  const r = reactRate.get(id) || { n: 0, t: now };
  if (now - r.t > 1000) { r.n = 0; r.t = now; }
  if (r.n + n > 12) return res.json({ ok: false, slow: true });
  r.n += n; reactRate.set(id, r);
  for (let i = 0; i < n; i++) reactionLog.push({ id: ++reactionSeq, e, t: now });
  if (reactionLog.length > 150) reactionLog = reactionLog.slice(-150);
  res.json({ ok: true });
});

// L'écran récupère les nouvelles réactions et l'état du vote
app.get("/api/fun-feed", (req, res) => {
  const after = parseInt(req.query.after, 10) || 0;
  res.json({ last: reactionSeq, reactionsOn, reactions: reactionLog.filter(r => r.id > after), poll });
});

app.post("/api/vote", (req, res) => {
  const id = String(req.query.id || "").slice(0, 40);
  const i = parseInt(req.query.i, 10);
  if (!poll || !poll.open || !id || !(i >= 0 && i < poll.options.length)) return res.status(400).json({ ok: false });
  if (pollVoters.has(id)) poll.votes[pollVoters.get(id)]--;
  pollVoters.set(id, i);
  poll.votes[i]++;
  res.json({ ok: true, mine: i });
});

app.get("/api/my-vote", (req, res) => {
  const id = String(req.query.id || "");
  res.json({ pollId: poll ? poll.id : 0, mine: pollVoters.has(id) ? pollVoters.get(id) : -1 });
});

app.post("/api/fun-admin", (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Non autorisé" });
  const a = String(req.query.a || "");
  if (a === "react_on") reactionsOn = true;
  else if (a === "react_off") reactionsOn = false;
  else if (a === "poll_start") {
    const q = String(req.query.q || "").slice(0, 60);
    const opts = String(req.query.o || "").split("|").map(x => x.trim().slice(0, 20)).filter(Boolean).slice(0, 4);
    if (opts.length < 2) return res.status(400).json({ error: "2 choix minimum" });
    pollVoters.clear();
    poll = { id: ++pollSeq, question: q, options: opts, votes: opts.map(() => 0), open: true };
  }
  else if (a === "poll_stop" && poll) poll.open = false;
  else if (a === "poll_clear") { poll = null; pollVoters.clear(); }
  res.json({ ok: true, reactionsOn, poll });
});

app.get("/", (req, res) => {
  res.send("Photobooth server actif.");
});

app.listen(PORT, () => {
  console.log(`Serveur photobooth démarré sur le port ${PORT}`);
});
