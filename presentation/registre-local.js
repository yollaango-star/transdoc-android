// TransDoc — registre LOCAL pour les présentations (aucun réseau, aucun compte, aucun e-mail).
// Remplace la bibliothèque Supabase par une imitation qui garde les données dans le navigateur (localStorage)
// et reproduit les règles du vrai registre (supabase/migrations) : pièces déclarées / vérifiées, verdict de contrôle,
// statistiques par province, journal, rôles, codes QR signés (ECDSA P-256, comme la fonction « qr »).
// Un bandeau permet de changer de rôle (propriétaire, agent, administrateur) et de réinitialiser la démonstration.
(function () {
  const CLE = 'transdoc.presentation.registre', CLE_ROLE = 'transdoc.presentation.role', CLE_QR = 'transdoc.presentation.qr';
  const COMPTES = {
    proprietaire: { id: 'pres-proprietaire', email: 'jean.mba@exemple.ga', nom: 'Jean Mba', tel: '+241 77 00 00 01' },
    agent: { id: 'pres-agent', email: 'agent.nze@police.ga', nom: 'Agent Nze', tel: '+241 77 00 00 02' },
    admin: { id: 'pres-admin', email: 'dgtt@transdoc.ga', nom: 'Administration DGTT', tel: '+241 77 00 00 03' },
  };
  const role = (() => { try { return COMPTES[localStorage.getItem(CLE_ROLE)] ? localStorage.getItem(CLE_ROLE) : 'proprietaire'; } catch (e) { return 'proprietaire'; } })();
  const moi = COMPTES[role];
  const PROVINCES = ['Estuaire', 'Haut-Ogooué', 'Moyen-Ogooué', 'Ngounié', 'Nyanga', 'Ogooué-Ivindo', 'Ogooué-Lolo', 'Ogooué-Maritime', 'Woleu-Ntem'];
  const PIECES = ['assurance', 'visite', 'vignette'];

  // ---------- Dates (Libreville = UTC+1, comme private.aujourdhui) ----------
  const aujourdhui = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
  const plus = (j) => new Date(Date.parse(aujourdhui() + 'T00:00:00Z') + j * 864e5).toISOString().slice(0, 10);
  const etat = (d) => (d < aujourdhui() ? 'ko' : d <= plus(30) ? 'warn' : 'ok');
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const code = () => 'TD' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (o) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[o % 32]).join('');

  // ---------- Données de démonstration ----------
  function initiales() {
    const d = { profiles: [], vehicles: [], vehicle_documents: [], controles: [] };
    for (const r of Object.keys(COMPTES)) d.profiles.push({ id: COMPTES[r].id, nom: COMPTES[r].nom, tel: COMPTES[r].tel, sms: true, role: r, email: COMPTES[r].email });
    const ajouter = (v, owner, pieces) => {
      d.vehicles.push({ plaque: norm(v.plaque), plaque_affichee: v.plaque, owner_id: owner, code: v.code || code(), categorie: v.categorie, marque: v.marque,
        modele: v.modele || null, titulaire: v.titulaire, province: v.province, carte_grise: v.carte_grise, demo: false, created_at: new Date().toISOString() });
      for (const [piece, j, statut, source] of pieces) d.vehicle_documents.push({ plaque: norm(v.plaque), piece, expire_le: plus(j), statut, source });
    };
    // Véhicules du propriétaire de démonstration : un conforme vérifié, un seulement déclaré, un avec la vignette expirée
    ajouter({ plaque: 'ES-2471-A', categorie: 'Taxi', marque: 'Toyota', modele: 'Corolla', titulaire: 'Jean Mba', province: 'Estuaire', carte_grise: 'CG-247101' }, moiId('proprietaire'),
      [['assurance', 210, 'verifie', 'paiement'], ['visite', 140, 'verifie', 'dgtt'], ['vignette', 95, 'verifie', 'dgtt']]);
    ajouter({ plaque: 'ES-3318-C', categorie: 'Véhicule particulier', marque: 'Hyundai', modele: 'Tucson', titulaire: 'Jean Mba', province: 'Estuaire', carte_grise: 'CG-331803' }, moiId('proprietaire'),
      [['assurance', 180, 'declare', 'proprietaire'], ['visite', 22, 'declare', 'proprietaire'], ['vignette', 250, 'declare', 'proprietaire']]);
    ajouter({ plaque: 'ES-5096-B', categorie: 'Moto', marque: 'Yamaha', modele: 'Crypton', titulaire: 'Jean Mba', province: 'Estuaire', carte_grise: 'CG-509602' }, moiId('proprietaire'),
      [['assurance', 60, 'verifie', 'assureur'], ['visite', 120, 'verifie', 'dgtt'], ['vignette', -12, 'verifie', 'dgtt']]);
    // Parc national de démonstration (demo-*.json), pièces vérifiées, dates recalées sur aujourd'hui
    for (const v of window.TRANSDOC_PRESENTATION_PARC || [])
      ajouter({ plaque: v[0], code: v[1], categorie: v[2], marque: v[3], modele: v[4], titulaire: 'Titulaire ' + v[5], province: v[5], carte_grise: v[6] }, null,
        [['assurance', v[7], 'verifie', 'dgtt'], ['visite', v[8], 'verifie', 'dgtt'], ['vignette', v[9], 'verifie', 'dgtt']]);
    // Quelques contrôles déjà faits, pour le journal et le tableau de bord
    const parc = d.vehicles.slice(3, 40);
    parc.forEach((v, i) => {
      if (i % 3) return;
      const p = d.vehicle_documents.filter((x) => x.plaque === v.plaque);
      d.controles.push({ id: 'c' + i, agent_id: i % 2 ? moiId('agent') : 'pres-agent-2', plaque: v.plaque, saisie: v.plaque_affichee, province: v.province,
        resultat: p.some((x) => etat(x.expire_le) === 'ko') ? 'ko' : p.some((x) => etat(x.expire_le) === 'warn') ? 'warn' : 'ok', source: i % 2 ? 'qr' : 'saisie',
        created_at: new Date(Date.now() - (i + 1) * 3.7 * 3600e3).toISOString() });
    });
    d.profiles.push({ id: 'pres-agent-2', nom: 'Agent Ondo (Gendarmerie)', tel: null, sms: false, role: 'agent', email: 'ondo@gendarmerie.ga' });
    return d;
  }
  function moiId(r) { return COMPTES[r].id; }
  let D;
  try { D = JSON.parse(localStorage.getItem(CLE)); } catch (e) { D = null; }
  if (!D || !D.profiles) D = initiales();
  const sauver = () => { try { localStorage.setItem(CLE, JSON.stringify(D)); } catch (e) { /* mémoire seule */ } };
  sauver();
  const profilDe = (id) => D.profiles.find((p) => p.id === id);
  const monRole = () => (profilDe(moi.id) || {}).role || 'proprietaire';
  const estAdmin = () => monRole() === 'admin';
  const estAgent = () => ['agent', 'admin'].includes(monRole());
  const err = (message, code) => ({ data: null, error: { message, code } });
  const ok = (data) => ({ data, error: null });

  // ---------- Requêtes de table (sous-ensemble de supabase-js utilisé par transdoc.html) ----------
  const VUE = {
    profiles: (r) => r.id === moi.id || estAdmin(),
    vehicles: (r) => r.owner_id === moi.id || estAdmin(),
    vehicle_documents: (r) => estAdmin() || (D.vehicles.find((v) => v.plaque === r.plaque) || {}).owner_id === moi.id,
    controles: (r) => r.agent_id === moi.id,
  };
  function requete(table) {
    const q = { op: 'select', filtres: [], tri: null, limite: null, unique: false, colonnes: '*' };
    const b = {
      select(c) { if (q.op === 'select') q.colonnes = c || '*'; else q.retour = true; return b; },
      insert(v) { q.op = 'insert'; q.valeur = v; return b; },
      update(v) { q.op = 'update'; q.valeur = v; return b; },
      delete() { q.op = 'delete'; return b; },
      eq(k, v) { q.filtres.push([k, v]); return b; },
      order(k, o) { q.tri = [k, !o || o.ascending !== false]; return b; },
      limit(n) { q.limite = n; return b; },
      maybeSingle() { q.unique = true; return b; },
      then(res, rej) { return Promise.resolve().then(() => executer(table, q)).then(res, rej); },
    };
    return b;
  }
  const garde = (table, r) => VUE[table](r);
  const filtre = (table, q) => D[table].filter((r) => garde(table, r) && q.filtres.every(([k, v]) => r[k] === v));
  function executer(table, q) {
    if (q.op === 'select') {
      let l = filtre(table, q).map((r) => ({ ...r }));
      if (table === 'vehicles' && /vehicle_documents/.test(q.colonnes))
        l.forEach((v) => { v.vehicle_documents = D.vehicle_documents.filter((d) => d.plaque === v.plaque).map((d) => ({ piece: d.piece, expire_le: d.expire_le, statut: d.statut })); });
      if (q.tri) l.sort((a, b) => (a[q.tri[0]] < b[q.tri[0]] ? -1 : a[q.tri[0]] > b[q.tri[0]] ? 1 : 0) * (q.tri[1] ? 1 : -1));
      if (q.limite) l = l.slice(0, q.limite);
      return ok(q.unique ? l[0] || null : l);
    }
    if (q.op === 'insert') {
      const lignes = Array.isArray(q.valeur) ? q.valeur : [q.valeur];
      for (const v of lignes) {
        if (table === 'vehicles') {
          if (v.owner_id !== moi.id) return err('new row violates row-level security policy for table "vehicles"');
          if (!/^[A-Z0-9]{4,12}$/.test(v.plaque)) return err('new row violates check constraint "vehicles_plaque_check"');
          if (D.vehicles.some((x) => x.plaque === v.plaque)) return err('duplicate key value violates unique constraint "vehicles_pkey"', '23505');
          D.vehicles.push({ modele: null, ...v, code: code(), demo: false, created_at: new Date().toISOString() });
        } else if (table === 'vehicle_documents') {
          if (!garde('vehicle_documents', v)) return err('new row violates row-level security policy for table "vehicle_documents"');
          // Comme le trigger pieces_declarees : une écriture de l'application est une déclaration
          D.vehicle_documents.push({ ...v, statut: estAdmin() ? v.statut || 'declare' : 'declare', source: estAdmin() ? v.source || 'admin' : 'proprietaire' });
        } else return err('Écriture non prévue en présentation');
      }
      sauver(); return ok(null);
    }
    if (q.op === 'update') {
      const l = filtre(table, q);
      for (const r of l) {
        const v = { ...q.valeur };
        if (table === 'vehicle_documents' && !estAdmin()) { v.statut = 'declare'; v.source = 'proprietaire'; }
        Object.assign(r, v);
      }
      sauver(); return ok(q.retour ? l.map((r) => ({ plaque: r.plaque })) : null);
    }
    if (q.op === 'delete') {
      const l = filtre(table, q);
      D[table] = D[table].filter((r) => !l.includes(r));
      if (table === 'vehicles') D.vehicle_documents = D.vehicle_documents.filter((d) => D.vehicles.some((v) => v.plaque === d.plaque));
      sauver(); return ok(null);
    }
    return err('Opération non prévue');
  }

  // ---------- Fonctions du registre (mêmes règles que les migrations SQL) ----------
  const piecesDe = (p) => D.vehicle_documents.filter((d) => d.plaque === p);
  function verdict(p) {
    const l = piecesDe(p);
    if (l.length < 3 || l.some((d) => etat(d.expire_le) === 'ko')) return 'ko';
    if (l.some((d) => d.statut !== 'verifie')) return 'non_verifie';
    if (l.some((d) => etat(d.expire_le) === 'warn')) return 'warn';
    return 'ok';
  }
  const RPC = {
    controler({ p_saisie, p_source }) {
      if (!estAgent()) return err('Réservé aux agents de contrôle habilités');
      const s = norm(p_saisie); if (s.length < 4) return err('Saisissez une immatriculation ou un code TD');
      const v = D.vehicles.find((x) => x.plaque === s || x.code === s);
      const c = { id: 'c' + Date.now(), agent_id: moi.id, saisie: String(p_saisie).slice(0, 60), source: p_source === 'qr' ? 'qr' : 'saisie', created_at: new Date().toISOString() };
      if (!v) { D.controles.push({ ...c, plaque: null, province: null, resultat: 'introuvable' }); sauver(); return ok({ trouve: false, saisie: p_saisie }); }
      const res = verdict(v.plaque), pieces = {};
      piecesDe(v.plaque).forEach((d) => { pieces[d.piece] = { expire_le: d.expire_le, statut: d.statut, etat: etat(d.expire_le) }; });
      D.controles.push({ ...c, plaque: v.plaque, province: v.province, resultat: res }); sauver();
      return ok({ trouve: true, resultat: res, plaque: v.plaque_affichee, code: v.code, categorie: v.categorie, marque: v.marque, modele: v.modele,
        titulaire: v.titulaire, province: v.province, pieces, toutes_verifiees: piecesDe(v.plaque).every((d) => d.statut === 'verifie') });
    },
    stats_provinces({ p_categorie, p_demo }) {
      if (!estAdmin()) return err('Réservé aux administrateurs');
      return ok(PROVINCES.map((nom) => {
        const vs = D.vehicles.filter((v) => v.province === nom && (!p_categorie || v.categorie === p_categorie) && (p_demo !== false || !v.demo));
        const r = { province: nom, total: vs.length, ok: 0, warn: 0, ko: 0, exp_assurance: 0, exp_visite: 0, exp_vignette: 0 };
        vs.forEach((v) => {
          const l = piecesDe(v.plaque), ko = l.length < 3 || l.some((d) => etat(d.expire_le) === 'ko'), warn = l.some((d) => etat(d.expire_le) === 'warn');
          r[ko ? 'ko' : warn ? 'warn' : 'ok']++;
          l.forEach((d) => { if (etat(d.expire_le) === 'ko') r['exp_' + d.piece]++; });
        });
        return r;
      }));
    },
    stats_controles() {
      if (!estAdmin()) return err('Réservé aux administrateurs');
      const c = D.controles, debut = Date.parse(aujourdhui() + 'T00:00:00+01:00');
      return ok({ total: c.length, agents: new Set(c.map((x) => x.agent_id)).size, aujourdhui: c.filter((x) => Date.parse(x.created_at) >= debut).length,
        non_conformes: c.filter((x) => x.resultat === 'ko').length, non_verifies: c.filter((x) => x.resultat === 'non_verifie').length, par_qr: c.filter((x) => x.source === 'qr').length });
    },
    admin_vehicules({ p_q, p_province, p_a_verifier, p_demo, p_limite }) {
      if (!estAdmin()) return err('Réservé aux administrateurs');
      const t = String(p_q || '').trim(), c = norm(t);
      const l = D.vehicles.filter((v) => (p_demo || !v.demo) && (!p_province || v.province === p_province)
        && (!t || (c && (v.plaque.includes(c) || v.code === c)) || v.titulaire.toLowerCase().includes(t.toLowerCase()))
        && (!p_a_verifier || piecesDe(v.plaque).some((d) => d.statut !== 'verifie'))).sort((a, b) => (a.plaque < b.plaque ? -1 : 1));
      return ok({ total: l.length, vehicules: l.slice(0, Math.min(Math.max(p_limite || 50, 1), 200)).map((v) => {
        const pieces = {}; piecesDe(v.plaque).forEach((d) => { pieces[d.piece] = { expire_le: d.expire_le, statut: d.statut, source: d.source, etat: etat(d.expire_le) }; });
        return { plaque: v.plaque_affichee, cle: v.plaque, code: v.code, categorie: v.categorie, marque: v.marque, modele: v.modele, titulaire: v.titulaire,
          province: v.province, carte_grise: v.carte_grise, demo: v.demo, inscrit_le: v.created_at, pieces };
      }) });
    },
    admin_controles({ p_resultat, p_province, p_limite }) {
      if (!estAdmin()) return err('Réservé aux administrateurs');
      return ok(D.controles.filter((c) => (!p_resultat || c.resultat === p_resultat) && (!p_province || c.province === p_province))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, p_limite || 100)
        .map((c) => ({ le: c.created_at, agent: (profilDe(c.agent_id) || {}).nom || 'Compte supprimé', saisie: c.saisie, plaque: c.plaque, province: c.province, resultat: c.resultat, source: c.source })));
    },
    admin_rechercher({ p_q }) {
      if (!estAdmin()) return err('Réservé aux administrateurs');
      const t = String(p_q || '').toLowerCase(); if (t.length < 2) return ok([]);
      return ok(D.profiles.filter((p) => (p.nom || '').toLowerCase().includes(t) || p.email.includes(t)).map((p) => ({ id: p.id, nom: p.nom, email: p.email, role: p.role })));
    },
    admin_agents() {
      if (!estAdmin()) return err('Réservé aux administrateurs');
      return ok(D.profiles.filter((p) => p.role !== 'proprietaire').map((p) => ({ id: p.id, nom: p.nom, email: p.email, role: p.role })));
    },
    admin_definir_role({ p_user, p_role }) {
      if (!estAdmin()) return err('Réservé aux administrateurs');
      if (p_user === moi.id && p_role !== 'admin') return err('Vous ne pouvez pas retirer votre propre rôle d’administrateur');
      const p = profilDe(p_user); if (!p) return err('Compte introuvable');
      p.role = p_role; sauver(); return ok(null);
    },
    supprimer_mon_compte() { return err('Indisponible en mode présentation : utilisez « Réinitialiser » dans le bandeau.'); },
  };

  // ---------- Codes QR signés (même format que supabase/functions/_shared/qr.ts) ----------
  const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
  const b64 = (o) => btoa(String.fromCharCode(...new Uint8Array(o))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function cles() {
    let k = null; try { k = JSON.parse(localStorage.getItem(CLE_QR)); } catch (e) { k = null; }
    if (!k) {
      const p = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']);
      const prive = await crypto.subtle.exportKey('jwk', p.privateKey);
      k = { kid: 'pres-' + code().slice(2, 6).toLowerCase(), prive, cle: { kty: prive.kty, crv: prive.crv, x: prive.x, y: prive.y } };
      try { localStorage.setItem(CLE_QR, JSON.stringify(k)); } catch (e) { /* mémoire seule */ }
    }
    return k;
  }
  async function qr(o) {
    const k = await cles();
    if ((o && o.method) === 'GET') return ok({ kid: k.kid, cle: k.cle, retirees: [] });
    const plaque = norm(o && o.body && o.body.plaque), v = D.vehicles.find((x) => x.plaque === plaque && garde('vehicles', x));
    if (!v) return err('Véhicule introuvable');
    const t = Math.floor(Date.now() / 1000), { key_ops, ...jwk } = k.prive;
    const prive = await crypto.subtle.importKey('jwk', jwk, ALGO, false, ['sign']);
    const sig = b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, prive, new TextEncoder().encode(['TD2', v.code, v.plaque_affichee, String(t)].join('|'))));
    return ok({ qr: { app: 'TransDoc-GA', v: 2, code: v.code, plaque: v.plaque_affichee, t, kid: k.kid, sig } });
  }

  // ---------- Authentification : session déjà ouverte pour le rôle choisi ----------
  const utilisateur = () => ({ id: moi.id, email: moi.email, is_anonymous: false });
  const session = () => ({ user: utilisateur(), access_token: 'presentation', refresh_token: 'presentation' });
  const AUTRE = 'En mode présentation, changez de rôle avec le bandeau en haut de l’écran.';
  const auth = {
    getSession: async () => ok({ session: session() }),
    getUser: async () => ok({ user: utilisateur() }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    refreshSession: async () => ok({ session: session() }),
    signInAnonymously: async () => ok({ session: session() }),
    setSession: async () => ok({ user: utilisateur(), session: session() }),
    updateUser: async (a) => (a && a.email ? err(AUTRE) : ok({ user: utilisateur() })),
    signInWithPassword: async () => err(AUTRE),
    resetPasswordForEmail: async () => err(AUTRE),
    verifyOtp: async () => err(AUTRE),
    signOut: async () => ok(null),
  };
  const client = {
    auth, from: requete,
    rpc: async (n, a) => (RPC[n] ? RPC[n](a || {}) : err('Fonction « ' + n + ' » non disponible en présentation')),
    functions: { invoke: async (nom, o) => (nom === 'qr' ? qr(o) : err('Fonction non disponible')) },
  };
  window.supabase = { createClient: () => client };
  window.TRANSDOC_PRESENTATION = true;

  // ---------- Bandeau de présentation ----------
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '#presBar{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;padding:8px 12px;background:#13201A;color:#fff;font:600 14px/1.3 system-ui,sans-serif}'
      + '#presBar button{font:inherit;border:1px solid #F2C230;background:transparent;color:#F2C230;border-radius:999px;padding:6px 12px;cursor:pointer;min-height:36px}'
      + '#presBar button[aria-pressed=true]{background:#F2C230;color:#13201A}#presBar .pres-note{font-weight:500;opacity:.8}'
      + '#presBar button.pres-reset{border-color:#ffffff66;color:#fff}';
    document.head.appendChild(st);
    const bar = document.createElement('div');
    bar.id = 'presBar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Mode présentation');
    const libelles = { proprietaire: 'Propriétaire', agent: 'Agent de contrôle', admin: 'Administrateur DGTT' };
    bar.innerHTML = '<span class="pres-note">Mode présentation · données fictives, sans réseau</span>'
      + Object.keys(libelles).map((r) => '<button type="button" data-pres-role="' + r + '" aria-pressed="' + (r === role) + '">' + libelles[r] + '</button>').join('')
      + '<button type="button" class="pres-reset" data-pres-reset>Réinitialiser</button>';
    document.body.prepend(bar);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.presRole) { try { localStorage.setItem(CLE_ROLE, b.dataset.presRole); sessionStorage.removeItem('transdoc.tab'); } catch (x) { /* rien */ } location.reload(); }
      if (b.hasAttribute('data-pres-reset') && confirm('Remettre la démonstration à zéro (véhicules, contrôles, rôles) ?')) {
        try { localStorage.removeItem(CLE); localStorage.removeItem(CLE_QR); } catch (x) { /* rien */ } location.reload();
      }
    });
    // L'agent présente le contrôle par saisie : plaques d'exemple à portée de main
    if (role === 'agent') {
      const c = document.querySelector('#controle .lede');
      if (c) c.insertAdjacentHTML('afterend', '<p class="note" style="margin-top:-6px">Exemples : <strong>ES-2471-A</strong> (conforme), <strong>ES-3318-C</strong> (pièces non vérifiées), <strong>ES-5096-B</strong> (vignette expirée), <strong>XX-0000-Z</strong> (introuvable).</p>');
    }
  });
})();
