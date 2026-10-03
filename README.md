# TransDoc Gabon

Registre national des documents de transport : chaque propriétaire inscrit ses véhicules et leurs pièces (assurance, visite technique, vignette) et présente un code QR signé lors d'un contrôle ; l'agent vérifie en quelques secondes, même sans réseau pour l'authenticité du QR.

## Contenu du dépôt

| Chemin | Rôle |
| --- | --- |
| `transdoc.html` | Application (page unique) : propriétaire, agent de contrôle, administration DGTT |
| `.github/workflows/android.yml` | Tests, déploiement du registre, compilation et publication de l'APK Android (WebView) |
| `.github/workflows/surveillance.yml` | Vérification toutes les 30 minutes que le registre de production répond |
| `supabase/migrations/` | Schéma du registre, règles d'accès, fonctions de contrôle |
| `supabase/functions/qr/` | Edge Function de signature des codes QR (ECDSA P-256) |
| `supabase/seed.sql` | Véhicules de démonstration (plaques `DEMO-…`), généré par `npm run seed` ; jamais en production |
| `tests/db.test.js` | Tests des règles d'accès sur un vrai Postgres (PGlite) |
| `demo-*.json` | Données de démonstration par province (source de `seed.sql` et du mode hors ligne) |
| `docs/recette.md` | Cahier de recette et procès-verbal |
| `docs/exploitation.md` | Mise en production, sauvegardes, restauration, rotation de la clé QR, retour arrière |

## Développement

```bash
npm ci
```

```bash
npm run test:db
```

```bash
deno test supabase/functions/_shared/
```

Après modification d'un fichier `demo-*.json` : `npm run seed` régénère `supabase/seed.sql`.

## Livraison

- Pull request vers `main` : tests uniquement.
- Push sur `main` : tests, déploiement sur le registre de **recette**, APK de recette (onglet Actions → Artifacts).
- Tag `v*` (ex. `v1.0.0`) : tests, déploiement sur le registre de **production**, APK signé avec la clé officielle et publié dans Releases. La publication est refusée sans clé officielle ni registre de production.

Variables et secrets GitHub requis : voir [docs/exploitation.md](docs/exploitation.md).
