/* Génère supabase/seed.sql depuis les fichiers demo-*.json : 164 véhicules de démonstration (sans propriétaire),
   pour alimenter le tableau de bord par province. Les dates sont recalées sur le jour où le fichier est exécuté,
   comme le fait l'application hors ligne (référence : 24 septembre 2026).
   Les plaques sont préfixées DEMO (contrainte vehicles_demo_prefixe) : aucune ne peut coïncider avec un vrai véhicule.
   Usage : node scripts/seed-demo.js */
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const q = v => v === null || v === undefined || v === '' ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const jour = d => "current_date + (date '" + d + "' - date '2026-09-24')";

const vehicules = [], pieces = [];
for (const f of fs.readdirSync(racine).filter(n => /^demo-.*\.json$/.test(n)).sort()) {
  for (const v of Object.values(JSON.parse(fs.readFileSync(path.join(racine, f), 'utf8')).vehicules || {})) {
    const p = 'DEMO' + norm(v.plaque);
    vehicules.push('  (' + [q(p), q('DEMO-' + v.plaque), q(v.code), q(v.categorie), q(v.marque), q(v.modele), q(v.proprietaire), q(v.province), q(v.cartegrise), 'true'].join(', ') + ')');
    for (const k of ['assurance', 'visite', 'vignette']) pieces.push('  (' + [q(p), q(k), jour(v[k]), "'verifie'", "'demo'"].join(', ') + ')');
  }
}

const sql = [
  '-- Généré par scripts/seed-demo.js depuis demo-*.json. Ne pas modifier à la main.',
  '-- Véhicules de démonstration : sans propriétaire, marqués demo, plaques préfixées DEMO, pièces vérifiées, dates recalées sur aujourd’hui.',
  'insert into public.vehicles (plaque, plaque_affichee, code, categorie, marque, modele, titulaire, province, carte_grise, demo) values',
  vehicules.join(',\n'),
  'on conflict (plaque) do nothing;',
  '',
  'insert into public.vehicle_documents (plaque, piece, expire_le, statut, source) values',
  pieces.join(',\n'),
  'on conflict (plaque, piece) do update set expire_le = excluded.expire_le, statut = excluded.statut, source = excluded.source;',
  ''
].join('\n');
fs.mkdirSync(path.join(racine, 'supabase'), { recursive: true });
fs.writeFileSync(path.join(racine, 'supabase', 'seed.sql'), sql);
console.log('supabase/seed.sql :', vehicules.length, 'véhicules,', pieces.length, 'pièces');
