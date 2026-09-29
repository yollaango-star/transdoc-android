// TransDoc — codes QR signés.
//   GET  : clé publique (agents connectés, mise en cache pour vérifier les QR sans réseau).
//   POST { plaque } : QR signé du véhicule, pour son propriétaire (ou un administrateur).
// La paire de clés est créée ici au premier appel et rangée dans public.qr_cles (inaccessible aux applications).
import { withSupabase } from 'npm:@supabase/server@1.8.1';
import { ALGO, partiePublique, signer } from '../_shared/qr.ts';

type Cles = { kid: string; prive: JsonWebKey; publique: JsonWebKey };
// deno-lint-ignore no-explicit-any
async function cles(db: any): Promise<Cles> {
  const lire = () => db.from('qr_cles').select('kid, prive, publique').eq('id', 1).maybeSingle();
  let { data } = await lire();
  if (!data) {
    const paire = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']) as CryptoKeyPair;
    const prive = await crypto.subtle.exportKey('jwk', paire.privateKey);
    const publique = await crypto.subtle.exportKey('jwk', paire.publicKey);
    // Deux premiers appels simultanés : un seul enregistrement gagne, les deux relisent la même clé.
    await db.from('qr_cles').upsert({ id: 1, kid: crypto.randomUUID().slice(0, 8), prive, publique }, { onConflict: 'id', ignoreDuplicates: true });
    ({ data } = await lire());
  }
  if (!data) throw new Error('Clé de signature indisponible');
  return data;
}

const erreur = (status: number, message: string) => Response.json({ erreur: message }, { status });

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    try {
      const k = await cles(ctx.supabaseAdmin);
      if (req.method === 'GET') return Response.json({ kid: k.kid, cle: partiePublique(k.publique) });
      if (req.method !== 'POST') return erreur(405, 'Méthode non autorisée');

      let corps: { plaque?: string };
      try { corps = await req.json(); } catch { return erreur(400, 'Requête invalide'); }
      const plaque = String(corps.plaque ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      // Client soumis aux règles d'accès : seul le propriétaire (ou un administrateur) voit ce véhicule.
      const { data: v } = await ctx.supabase.from('vehicles').select('plaque_affichee, code').eq('plaque', plaque).maybeSingle();
      if (!v) return erreur(404, 'Véhicule introuvable');

      const t = Math.floor(Date.now() / 1000);
      const prive = await crypto.subtle.importKey('jwk', k.prive, ALGO, false, ['sign']);
      const sig = await signer(prive, v.code, v.plaque_affichee, t);
      return Response.json({ qr: { app: 'TransDoc-GA', v: 2, code: v.code, plaque: v.plaque_affichee, t, kid: k.kid, sig } });
    } catch (e) {
      console.error(e);
      return erreur(500, 'Impossible de générer le code QR pour l’instant.');
    }
  }),
};
