const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

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

// Réception d'une nouvelle photo depuis le téléphone
app.post("/api/photos", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucune photo reçue" });

  const caption = (req.body.caption || "").slice(0, 20);
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

app.get("/", (req, res) => {
  res.send("Photobooth server actif.");
});

app.listen(PORT, () => {
  console.log(`Serveur photobooth démarré sur le port ${PORT}`);
});
