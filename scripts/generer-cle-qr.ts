// Génère une nouvelle clé de signature des codes QR, à ranger dans le secret QR_CLE_PRIVEE de l'Edge Function « qr ».
// Usage : deno run scripts/generer-cle-qr.ts
// Rotation : avant de remplacer QR_CLE_PRIVEE, ajouter l'ancienne clé PUBLIQUE ({ kid, cle }) au secret QR_CLES_RETIREES,
// pour que les QR déjà affichés restent vérifiables jusqu'à leur renouvellement (voir docs/exploitation.md).
import { ALGO, partiePublique } from '../supabase/functions/_shared/qr.ts';

const paire = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']) as CryptoKeyPair;
const prive = await crypto.subtle.exportKey('jwk', paire.privateKey);
const kid = crypto.randomUUID().slice(0, 8);
console.log('QR_CLE_PRIVEE (secret, ne jamais publier) :');
console.log(JSON.stringify({ ...prive, kid }));
console.log('\nClé publique correspondante, pour QR_CLES_RETIREES lors de la prochaine rotation :');
console.log(JSON.stringify({ kid, cle: partiePublique(prive) }));
