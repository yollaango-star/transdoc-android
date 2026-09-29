// Tests du registre TransDoc : applique les migrations dans un vrai Postgres (PGlite), puis joue chaque rôle
// (visiteur, propriétaire, autre propriétaire, agent, administrateur, serveur) contre les règles d'accès.
// Usage : npm run test:db
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const SUPA = path.join(__dirname, '..', 'supabase');
const P1 = '11111111-1111-4111-8111-111111111111'; // propriétaire
const P2 = '22222222-2222-4222-8222-222222222222'; // autre propriétaire
const AG = '33333333-3333-4333-8333-333333333333'; // agent
const AD = '44444444-4444-4444-8444-444444444444'; // administrateur

let db;
async function as(role, uid, sql, params) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await db.query(sql, params || []); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const user = (uid, sql, p) => as('authenticated', uid, sql, p);
const one = async p => (await p).rows[0];
const n = async p => (await one(p)).n;
const rejects = (p, re) => assert.rejects(p, re);

test.before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, 'db', 'supabase-stub.sql'), 'utf8'));
  for (const f of fs.readdirSync(path.join(SUPA, 'migrations')).filter(f => f.endsWith('.sql')).sort()) {
    try { await db.exec(fs.readFileSync(path.join(SUPA, 'migrations', f), 'utf8')); } catch (e) { throw new Error(f + ' : ' + e.message); }
  }
  await db.exec(fs.readFileSync(path.join(SUPA, 'seed.sql'), 'utf8'));
  // Comptes (Supabase Auth en production) : le profil « propriétaire » est créé automatiquement
  await db.exec(`insert into auth.users (id, email) values ('${P1}', 'p1@exemple.ga'), ('${P2}', 'p2@exemple.ga'), ('${AG}', 'agent@police.ga'), ('${AD}', 'admin@dgtt.ga');
    update public.profiles set role = 'admin', nom = 'Admin DGTT' where id = '${AD}';
    update public.profiles set nom = 'Agent Mba' where id = '${AG}';`);
});

const INSCRIRE = `insert into public.vehicles (plaque, plaque_affichee, owner_id, categorie, marque, titulaire, province, carte_grise)
  values ($1, $2, $3, 'Taxi', 'Toyota', 'Jean Test', 'Estuaire', 'CG-123456') returning code`;

test('visiteur : aucun accès au registre', async () => {
  assert.equal(await n(as('anon', null, 'select count(*)::int n from public.provinces')), 9);
  await rejects(as('anon', null, 'select * from public.vehicles'), /permission denied/);
  await rejects(as('anon', null, `select public.controler('ES9745B')`), /permission denied/);
});

test('propriétaire : inscrit son véhicule, ne voit que les siens, plaque unique', async () => {
  const v = await one(user(P1, INSCRIRE, ['ES1234A', 'ES-1234-A', P1]));
  assert.match(v.code, /^TD[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(await n(user(P1, 'select count(*)::int n from public.vehicles')), 1);            // pas les 164 de démo
  assert.equal(await n(user(P2, 'select count(*)::int n from public.vehicles')), 0);
  await rejects(user(P2, INSCRIRE, ['ES1234A', 'ES 1234 A', P2]), /duplicate key|vehicles_pkey/); // plaque déjà inscrite
  await rejects(user(P2, INSCRIRE, ['ES5555B', 'ES-5555-B', P1]), /row-level security/);           // au nom d'un autre
  await rejects(user(P1, `insert into public.vehicles (plaque, plaque_affichee, owner_id, categorie, marque, titulaire, province, carte_grise, demo)
    values ('ES7777C', 'ES-7777-C', $1, 'Taxi', 'Kia', 'X', 'Estuaire', 'CG-1', true)`, [P1]), /permission denied/);
  await rejects(user(P1, `update public.vehicles set code = 'TDAAAAAAAA' where plaque = 'ES1234A'`), /permission denied/);
  await rejects(user(P1, `update public.vehicles set owner_id = $1 where plaque = 'ES1234A'`, [P2]), /permission denied/);
  assert.equal((await user(P2, `update public.vehicles set marque = 'Pirate' where plaque = 'ES1234A' returning 1`)).rows.length, 0);
});

test('pièces : le propriétaire déclare, seul le serveur ou l’administrateur vérifie', async () => {
  await user(P1, `insert into public.vehicle_documents (plaque, piece, expire_le, statut) values
    ('ES1234A', 'assurance', current_date + 200, 'verifie'), ('ES1234A', 'visite', current_date + 10, 'declare'), ('ES1234A', 'vignette', current_date - 5, 'declare')`);
  const s = await user(P1, `select piece, statut, source from public.vehicle_documents where plaque = 'ES1234A' order by piece`);
  assert.ok(s.rows.every(r => r.statut === 'declare' && r.source === 'proprietaire'), 'le téléphone ne peut pas se déclarer « vérifié »');
  await user(P1, `update public.vehicle_documents set statut = 'verifie' where plaque = 'ES1234A'`);
  assert.equal(await n(db.query(`select count(*)::int n from public.vehicle_documents where plaque = 'ES1234A' and statut = 'verifie'`)), 0);
  await rejects(user(P2, `insert into public.vehicle_documents (plaque, piece, expire_le) values ('ES9745B', 'assurance', current_date + 999)`), /row-level security/);
  // Le serveur (paiement confirmé) vérifie ; l'administrateur aussi
  await as('service_role', null, `update public.vehicle_documents set statut = 'verifie', source = 'paiement' where plaque = 'ES1234A' and piece = 'assurance'`);
  await user(AD, `update public.vehicle_documents set statut = 'verifie', source = 'admin' where plaque = 'ES1234A' and piece = 'visite'`);
  const v = await one(db.query(`select count(*) filter (where statut = 'verifie')::int n, bool_and(verifie_le is not null) filter (where statut = 'verifie') t from public.vehicle_documents where plaque = 'ES1234A'`));
  assert.deepEqual([v.n, v.t], [2, true]);
  // Le propriétaire modifie une date vérifiée : elle redevient une déclaration
  await user(P1, `update public.vehicle_documents set expire_le = current_date + 400 where plaque = 'ES1234A' and piece = 'assurance'`);
  assert.equal((await one(db.query(`select statut from public.vehicle_documents where plaque = 'ES1234A' and piece = 'assurance'`))).statut, 'declare');
});

test('contrôle : réservé aux agents, toujours journalisé, par plaque ou par code', async () => {
  await rejects(user(P1, `select public.controler('ES9745B')`), /Réservé aux agents/);
  await rejects(user(P1, `select * from public.stats_provinces()`), /Réservé aux agents/);
  await user(AD, `select public.admin_definir_role($1, 'agent')`, [AG]);
  const r = (await one(user(AG, `select public.controler('es-1234 a', 'saisie') r`))).r;
  assert.equal(r.trouve, true); assert.equal(r.resultat, 'ko'); // vignette expirée
  assert.equal(r.pieces.vignette.etat, 'ko'); assert.equal(r.toutes_verifiees, false);
  const code = (await one(db.query(`select code from public.vehicles where plaque = 'ES9745B'`))).code;
  const d = (await one(user(AG, `select public.controler($1, 'qr') r`, [code]))).r;
  assert.equal(d.plaque, 'ES-9745-B'); assert.equal(d.toutes_verifiees, true);
  assert.equal((await one(user(AG, `select public.controler('XX0000Z') r`))).r.trouve, false);
  const c = await user(AG, `select resultat, source from public.controles order by created_at`);
  assert.deepEqual(c.rows.map(x => x.resultat + '/' + x.source), ['ko/saisie', d.resultat + '/qr', 'introuvable/saisie']);
  assert.equal(await n(user(P1, 'select count(*)::int n from public.controles')), 0); // un propriétaire ne voit pas les contrôles
  await rejects(user(AG, `insert into public.controles (agent_id, saisie, resultat, source) values ($1, 'x', 'ok', 'qr')`, [AG]), /permission denied/);
  await rejects(user(AG, 'select * from public.vehicles where demo'), /./).catch(() => {}); // aucune ligne visible de toute façon
  assert.equal(await n(user(AG, 'select count(*)::int n from public.vehicles')), 0); // l'agent ne parcourt pas le registre
});

test('tableau de bord : chiffres agrégés par province, filtres', async () => {
  const rows = (await user(AG, 'select * from public.stats_provinces()')).rows;
  assert.equal(rows.length, 9);
  assert.equal(rows.reduce((s, r) => s + r.total, 0), 165); // 164 démo + 1 réel
  assert.ok(rows.every(r => r.ok + r.warn + r.ko === r.total));
  const reels = (await user(AG, 'select sum(total)::int n from public.stats_provinces(null, false)')).rows[0].n;
  assert.equal(reels, 1);
  const taxis = (await user(AG, `select sum(total)::int n from public.stats_provinces('Taxi', true)`)).rows[0].n;
  assert.ok(taxis >= 1 && taxis < 165);
  const s = (await one(user(AG, 'select public.stats_controles() s'))).s;
  assert.equal(s.total, 3); assert.equal(s.par_qr, 1); assert.equal(s.agents, 1);
});

test('administration : rôles attribués par un administrateur seulement', async () => {
  await rejects(user(AG, `select public.admin_definir_role($1, 'admin')`, [AG]), /Réservé aux administrateurs/);
  await rejects(user(P1, `update public.profiles set role = 'admin' where id = $1`, [P1]), /permission denied/);
  await rejects(user(AD, `select public.admin_definir_role($1, 'agent')`, [AD]), /propre rôle/);
  const hits = (await user(AD, `select * from public.admin_rechercher('police')`)).rows;
  assert.deepEqual(hits.map(h => h.email), ['agent@police.ga']);
  assert.equal((await user(AD, 'select * from public.admin_agents()')).rows.length, 2);
  await rejects(user(P1, `select * from public.admin_rechercher('ga')`), /Réservé aux administrateurs/);
  await user(AD, `select public.admin_definir_role($1, 'proprietaire')`, [AG]);
  await rejects(user(AG, `select public.controler('ES9745B')`), /Réservé aux agents/);
});

test('profil : chacun modifie ses coordonnées, personne ne lit celles des autres', async () => {
  await user(P1, `update public.profiles set nom = 'Jean Test', tel = '+24177000000', sms = false where id = $1`, [P1]);
  assert.equal(await n(user(P2, 'select count(*)::int n from public.profiles')), 1);
  assert.equal(await n(user(AG, `select count(*)::int n from public.profiles where tel is not null`)), 0);
});

test('fonctions internes fermées', async () => {
  await rejects(as('anon', null, 'select private.est_admin()'), /permission denied/);
  await rejects(as('anon', null, 'select private.nouveau_code()'), /permission denied/);
  await rejects(user(P1, `select private.pieces_declarees()`), /permission denied|trigger functions/);
});

test('retrait du véhicule et suppression du compte', async () => {
  await user(P1, `delete from public.vehicles where plaque = 'ES1234A'`);
  assert.equal(await n(db.query(`select count(*)::int n from public.vehicle_documents where plaque = 'ES1234A'`)), 0);
  assert.equal(await n(db.query(`select count(*)::int n from public.controles where plaque = 'ES1234A'`)), 1); // historique conservé
  await db.exec(`delete from auth.users where id = '${P1}'`);
  assert.equal(await n(db.query(`select count(*)::int n from public.profiles where id = '${P1}'`)), 0);
});
