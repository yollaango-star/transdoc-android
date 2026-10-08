/* Construit l'application de PRÉSENTATION (presentation/app/) à partir de transdoc.html :
   - la bibliothèque Supabase est remplacée par le registre local (presentation/registre-local.js) : aucun réseau,
     aucun compte, aucun e-mail ; un bandeau permet de passer de propriétaire à agent puis administrateur ;
   - le parc de démonstration (demo-*.json) est embarqué, dates recalées sur le jour de la présentation ;
   - les bibliothèques QR sont téléchargées une fois et vérifiées par empreinte, puis embarquées (hors ligne).
   Usage : node scripts/construire-presentation.js   (puis, dans presentation/ : npm ci && npm run demarrer) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const racine = path.join(__dirname, '..');
const sortie = path.join(racine, 'presentation', 'app');
const LIBS = {
  'qrcode.min.js': ['https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', 'c541ef06327885a8415bca8df6071e14189b4855336def4f36db54bde8484f36'],
  'jsQR.js': ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', 'bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859'],
};
const erreur = (m) => { console.error('Présentation : ' + m); process.exit(1); };

function remplacer(h, motif, par, quoi) {
  const n = (h.match(motif) || []).length;
  if (n !== 1) erreur(quoi + ' introuvable dans transdoc.html (' + n + ' occurrence(s))');
  return h.replace(motif, par);
}

async function bibliotheques() {
  fs.mkdirSync(path.join(sortie, 'lib'), { recursive: true });
  for (const [nom, [url, attendu]] of Object.entries(LIBS)) {
    const f = path.join(sortie, 'lib', nom);
    let octets = fs.existsSync(f) ? fs.readFileSync(f) : null;
    if (!octets || crypto.createHash('sha256').update(octets).digest('hex') !== attendu) {
      const r = await fetch(url);
      if (!r.ok) erreur(nom + ' : téléchargement impossible (' + r.status + ')');
      octets = Buffer.from(await r.arrayBuffer());
    }
    const h = crypto.createHash('sha256').update(octets).digest('hex');
    if (h !== attendu) erreur(nom + ' : empreinte SHA-256 inattendue (' + h + ')');
    fs.writeFileSync(f, octets);
  }
}

function parc() {
  // [plaque, code, catégorie, marque, modèle, province, carte grise, j. assurance, j. visite, j. vignette] (jours depuis aujourd'hui)
  const ref = Date.parse('2026-09-24T00:00:00Z'), j = (d) => Math.round((Date.parse(d + 'T00:00:00Z') - ref) / 864e5);
  const l = [];
  for (const f of fs.readdirSync(racine).filter((n) => /^demo-.*\.json$/.test(n)).sort())
    for (const v of Object.values(JSON.parse(fs.readFileSync(path.join(racine, f), 'utf8')).vehicules || {}))
      l.push([v.plaque, v.code, v.categorie, v.marque, v.modele || null, v.province, v.cartegrise, j(v.assurance), j(v.visite), j(v.vignette)]);
  return l;
}

(async () => {
  let h = fs.readFileSync(path.join(racine, 'transdoc.html'), 'utf8');
  h = remplacer(h, /<script src="[^"]*qrcode[^"]*"[^>]*><\/script>/, '<script src="lib/qrcode.min.js"></script>', 'Bibliothèque qrcode');
  h = remplacer(h, /<script src="[^"]*jsqr[^"]*"[^>]*><\/script>/i, '<script src="lib/jsQR.js"></script>', 'Bibliothèque jsQR');
  const donnees = parc();
  h = remplacer(h, /<script src="[^"]*supabase-js[^"]*"[^>]*><\/script>/,
    '<script>window.TRANSDOC_PRESENTATION_PARC=' + JSON.stringify(donnees) + ';</script>\n<script src="registre-local.js"></script>', 'Bibliothèque Supabase');
  h = remplacer(h, /window\.TRANSDOC_SUPABASE = \{[^}]*\};/, "window.TRANSDOC_SUPABASE = { url: 'https://presentation.transdoc.local', key: 'presentation' };", 'Configuration du registre');
  h = remplacer(h, /<title>[^<]*<\/title>/, '<title>TransDoc Gabon — Présentation</title>', 'Titre');
  if (/<script src="https?:\/\//.test(h)) erreur('une bibliothèque reste chargée depuis Internet');
  fs.mkdirSync(sortie, { recursive: true });
  fs.writeFileSync(path.join(sortie, 'index.html'), h);
  fs.copyFileSync(path.join(racine, 'presentation', 'registre-local.js'), path.join(sortie, 'registre-local.js'));
  await bibliotheques();
  console.log('presentation/app/ prêt :', donnees.length + 3, 'véhicules de démonstration, bibliothèques vérifiées');
})().catch((e) => erreur(e.message));
