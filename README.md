# TransDoc Gabon

Développé par **YOLLA ANGO Fred Darrel**.

Registre national des documents de transport : chaque propriétaire inscrit ses véhicules et leurs pièces (assurance, visite technique, vignette) et présente un code QR signé lors d'un contrôle ; l'agent vérifie en quelques secondes, même sans réseau pour l'authenticité du QR.

## Espaces après connexion

| Rôle | Attribué par | Onglets |
| --- | --- | --- |
| Propriétaire | Inscription (e-mail confirmé) | Mes véhicules, Échéances, Mon compte |
| Agent de contrôle | Un administrateur (onglet Agents) | Contrôle routier (QR ou plaque), Mon compte |
| Administrateur (DGTT) | Un autre administrateur | Registre national (consultation, vérification des pièces), Tableau de bord, Journal des contrôles, Agents, Mon compte |

Le rôle est lu sur le serveur : l'application n'affiche que l'espace correspondant, et les fonctions de la base refusent tout appel hors rôle (statistiques, registre et journal réservés à l'administration).

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

## Présentation sur ordinateur (sans compte ni réseau)

`TransDoc-presentation.exe` (Windows, portable, sans installation) montre l'application avec des données fictives :
un bandeau en haut de l'écran fait passer de **Propriétaire** à **Agent de contrôle** puis **Administrateur DGTT**,
et « Réinitialiser » remet la démonstration à zéro. Aucun e-mail, aucun mot de passe, aucune connexion Internet.

- Télécharger : onglet Actions → « Construire la présentation » → dernière exécution → Artifacts → `TransDoc-presentation`.
- Scénario conseillé : le propriétaire inscrit un véhicule → l'agent le contrôle (« Pièces non vérifiées ») →
  l'administrateur vérifie ses pièces dans le registre national → l'agent recontrôle (« Conforme »).
- Sans l'exécutable : `node scripts/construire-presentation.js`, puis ouvrir `presentation/app/index.html` dans un navigateur.

Le registre simulé (`presentation/registre-local.js`) reproduit les règles des migrations ; il garde les données sur l'ordinateur.

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
