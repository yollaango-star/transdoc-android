// TransDoc — format des codes QR signés (version 2).
// Contenu du QR : { app: 'TransDoc-GA', v: 2, code, plaque, t, kid, sig }
//   t   : date de signature (secondes)       kid : identifiant de la clé
//   sig : signature ECDSA P-256 / SHA-256 (format brut r||s, base64url) de message(code, plaque, t)
// L'application de l'agent refait message() et vérifie la signature avec la clé publique, même sans réseau.
// Toute modification de ce format doit être reportée dans transdoc.html (verifierQR).

export const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const;
export const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' } as const;

export const message = (code: string, plaque: string, t: number) => ['TD2', code, plaque, String(t)].join('|');

export function versBase64url(octets: ArrayBuffer | Uint8Array): string {
  let s = '';
  for (const o of new Uint8Array(octets)) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function depuisBase64url(texte: string): Uint8Array<ArrayBuffer> {
  const b = atob(texte.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texte.length % 4)) % 4));
  const o = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
  return o;
}

export async function signer(prive: CryptoKey, code: string, plaque: string, t: number): Promise<string> {
  return versBase64url(await crypto.subtle.sign(SIGNATURE, prive, new TextEncoder().encode(message(code, plaque, t))));
}
export async function verifier(publique: CryptoKey, qr: { code: string; plaque: string; t: number; sig: string }): Promise<boolean> {
  try {
    return await crypto.subtle.verify(SIGNATURE, publique, depuisBase64url(qr.sig), new TextEncoder().encode(message(qr.code, qr.plaque, qr.t)));
  } catch {
    return false;
  }
}
// Seule la partie publique quitte le serveur.
export const partiePublique = (jwk: JsonWebKey) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
