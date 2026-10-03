// deno test supabase/functions/_shared/
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { ALGO, cleDuKid, depuisBase64url, lireRetirees, message, partiePublique, perime, signer, verifier, versBase64url, VALIDITE_SECONDES } from './qr.ts';

const paire = async () => await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']) as CryptoKeyPair;

Deno.test('un QR signé est reconnu, un QR modifié ne l’est plus', async () => {
  const { privateKey, publicKey } = await paire();
  const qr = { code: 'TDERLSTY', plaque: 'ES-9745-B', t: 1790000000 };
  const sig = await signer(privateKey, qr.code, qr.plaque, qr.t);
  assert(await verifier(publicKey, { ...qr, sig }));
  assert(!(await verifier(publicKey, { ...qr, plaque: 'ES-9745-C', sig })));   // plaque changée
  assert(!(await verifier(publicKey, { ...qr, code: 'TDAAAAAAAA', sig })));    // code changé
  assert(!(await verifier(publicKey, { ...qr, t: qr.t + 1, sig })));          // date changée
  assert(!(await verifier(publicKey, { ...qr, sig: 'abc' })));               // signature illisible
  const autre = await paire();
  assert(!(await verifier(autre.publicKey, { ...qr, sig })));                // autre clé
});

Deno.test('la clé publique exportée ne contient pas la partie secrète', async () => {
  const { privateKey } = await paire();
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  assert(jwk.d);
  const pub = partiePublique(jwk);
  assertEquals(Object.keys(pub).sort(), ['crv', 'kty', 'x', 'y']);
  const cle = await crypto.subtle.importKey('jwk', pub, ALGO, false, ['verify']);
  assertEquals(cle.type, 'public');
});

Deno.test('encodage base64url et message', () => {
  const o = new Uint8Array([0, 255, 62, 63, 250]);
  assertEquals(depuisBase64url(versBase64url(o)), o);
  assert(!/[+/=]/.test(versBase64url(o)));
  assertEquals(message('TDX', 'ES-1-A', 5), 'TD2|TDX|ES-1-A|5');
});

Deno.test('rotation : la clé est choisie par son kid, les clés retirées restent valables', async () => {
  const ancienne = await paire(), nouvelle = await paire();
  const pub = async (k: CryptoKeyPair) => partiePublique(await crypto.subtle.exportKey('jwk', k.privateKey));
  const active = { kid: 'k2', cle: await pub(nouvelle) };
  const retirees = lireRetirees(JSON.stringify([{ kid: 'k1', cle: await pub(ancienne) }, { kid: 'casse' }]));
  assertEquals(retirees.map((c) => c.kid), ['k1']);
  const sig = await signer(ancienne.privateKey, 'TDX', 'ES-1-A', 5);
  const cle = cleDuKid(active, retirees, 'k1');
  assert(cle);
  const k = await crypto.subtle.importKey('jwk', cle.cle, ALGO, false, ['verify']);
  assert(await verifier(k, { code: 'TDX', plaque: 'ES-1-A', t: 5, sig }));
  assertEquals(cleDuKid(active, retirees, 'inconnu'), null);
  assertEquals(lireRetirees('pas du json'), []);
  assertEquals(lireRetirees(undefined), []);
});

Deno.test('un QR de plus d’un an est périmé', () => {
  const maintenant = 1_800_000_000;
  assert(!perime(maintenant - 10, maintenant));
  assert(!perime(maintenant - VALIDITE_SECONDES, maintenant));
  assert(perime(maintenant - VALIDITE_SECONDES - 1, maintenant));
});
