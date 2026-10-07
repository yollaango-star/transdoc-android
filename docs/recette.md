# Cahier de recette TransDoc v1.0.0

À dérouler avant toute publication d'une version (tag `v*`), sur l'APK compilé par la CI et sur le registre de **recette** (`transdoc-test`).
Une ligne en échec avec la gravité « Bloquante » interdit la mise en production.

## Conditions

| Élément | Valeur attendue |
| --- | --- |
| APK | Artifact `TransDoc-apk` de la dernière exécution verte de la CI (jobs `tests` et `apk`) |
| Appareils | 3 au minimum : Android 8 (API 26), Android 11 (API 30), Android 14 (API 34) |
| Comptes | 1 propriétaire A, 1 propriétaire B, 1 agent, 1 administrateur DGTT (rôles attribués par l'administrateur) |
| Installation | Désinstaller une fois toute version de TransDoc compilée avant le 7 octobre 2026 (signée avec une clé aléatoire) ; les APK suivants, signés avec la clé de recette, s'installent par-dessus |
| Réseau | Chaque parcours marqué « hors ligne » est rejoué en mode avion |
| Registre | Migrations à jour, `seed.sql` appliqué (plaques `DEMO-…`) |

## Parcours

| ID | Parcours | Étapes | Résultat attendu | Gravité | Résultat | Testeur / date |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | Premier lancement | Installer l'APK, ouvrir | Accueil affiché, bandeau « Connexion au registre national… » puis disparu, profil anonyme créé | Bloquante | | |
| R02 | Inscription refusée sans compte | Profil anonyme : inscrire un véhicule | Refus avec le message « Ajoutez et confirmez votre e-mail… » ; aucun véhicule créé | Bloquante | | |
| R03 | Sécuriser le compte | Mon accès → ajouter un e-mail → ouvrir le lien reçu | TransDoc se rouvre seul (sinon, y revenir) ; toast « E-mail confirmé », formulaire mot de passe proposé ; l'inscription d'un véhicule est alors acceptée | Bloquante | | |
| R04 | Choisir un mot de passe | Saisir 8 caractères ou plus | Mot de passe enregistré ; 7 caractères refusés | Majeure | | |
| R05 | Inscrire un véhicule | Compte confirmé : plaque, catégorie, pièces avec dates | Véhicule visible, pièces « déclarées » | Bloquante | | |
| R06 | Plaque déjà inscrite | Propriétaire B : inscrire la plaque de A | Message « déjà inscrite… contactez la DGTT » | Bloquante | | |
| R07 | Plaque de démonstration | Inscrire `DEMO-1234` | Message « Immatriculation invalide » | Majeure | | |
| R08 | Modifier une date vérifiée | Après vérification DGTT, changer une date | La pièce redevient « déclarée » | Bloquante | | |
| R09 | QR signé | Afficher le QR du véhicule | QR affiché, code TD lisible | Bloquante | | |
| R10 | QR hors ligne (propriétaire) | Mode avion, rouvrir le QR | QR en cache affiché | Majeure | | |
| R11 | Contrôle par QR, pièces déclarées | Agent : scanner le QR de R09 | Badge « Code QR authentique », verdict orange « Pièces non vérifiées » | Bloquante | | |
| R12 | Contrôle, pièces vérifiées | Administrateur vérifie les 3 pièces ; agent recontrôle | Verdict vert « Conforme » | Bloquante | | |
| R13 | Contrôle, pièce expirée | Véhicule à vignette expirée | Verdict rouge « Non conforme » | Bloquante | | |
| R14 | Contrôle par saisie | Saisir la plaque avec tirets et minuscules | Même verdict que par QR | Majeure | | |
| R15 | Véhicule introuvable | Saisir `XX0000Z` | « Véhicule introuvable », contrôle journalisé | Majeure | | |
| R16 | QR falsifié | Modifier un caractère du contenu du QR, scanner | « Code QR refusé » | Bloquante | | |
| R17 | Contrôle hors ligne | Agent en mode avion, scanner un QR | Authenticité affichée, message « état des pièces illisible sans connexion » | Majeure | | |
| R18 | Caméra refusée | Refuser la permission caméra | Import d'une photo du QR proposé et fonctionnel | Majeure | | |
| R19 | Accès réservés | Propriétaire : seuls « Mes véhicules », « Échéances », « Mon compte » et « À propos » sont proposés | Aucun onglet de contrôle ni d'administration | Bloquante | | |
| R20 | Rôles | Administrateur : nommer puis retirer un agent | Droits appliqués au prochain lancement de l'agent | Bloquante | | |
| R21 | Réclamation de plaque | Administrateur : `admin_reattribuer_vehicule` vers le vrai propriétaire | Véhicule transféré, pièces redevenues « déclarées » | Majeure | | |
| R22 | Tableau de bord | Administrateur : statistiques, filtres catégorie et « démonstration » | Chiffres par province cohérents, aucune donnée personnelle | Majeure | | |
| R23 | Suppression du compte | Mon accès → Supprimer mon compte | Compte et véhicules supprimés, plaque de nouveau libre | Bloquante | | |
| R24 | Retour Android | Ouvrir une fenêtre, appui sur Retour | La fenêtre se ferme, l'app reste ouverte | Mineure | | |
| R25 | Rotation, mode sombre | Pivoter l'écran ; activer le thème sombre | Pas de perte de saisie, contrastes lisibles | Mineure | | |
| R26 | Mise à jour | Installer la nouvelle version par-dessus la précédente | Mise à jour acceptée (même clé de signature), session conservée | Bloquante | | |
| R27 | QR non signé | Scanner un ancien QR sans signature (format v1) | « Code QR refusé », invitation à saisir la plaque | Bloquante | | |
| R28 | Rotation de clé | En recette : rotation selon `docs/exploitation.md` §5, puis scanner un QR signé avec l'ancienne clé et un QR re-signé | Les deux « authentiques » ; après retrait de l'ancienne clé, l'ancien QR est « Signature non vérifiable » | Majeure | | |
| R29 | Journal conservé | Supprimer le compte d'un agent ayant fait des contrôles | Tableau de bord : nombre total de contrôles inchangé | Majeure | | |
| R30 | Espace contrôle | Se connecter avec un compte agent | Badge « Espace contrôle », ouverture sur « Contrôle routier » ; ni registre, ni tableau de bord, ni journal | Bloquante | | |
| R31 | Espace administration | Se connecter avec un compte administrateur | Badge « Espace administration », ouverture sur « Registre national » ; onglets Tableau de bord, Journal des contrôles, Agents | Bloquante | | |
| R32 | Registre national | Administrateur : rechercher par plaque, code TD et titulaire ; filtrer par province et « pièces à vérifier » | Résultats exacts ; démonstration exclue par défaut | Majeure | | |
| R33 | Vérification d'une pièce | Administrateur : « Vérifier » sur une pièce déclarée, puis contrôle du véhicule par un agent | Pièce « vérifiée (admin) » ; verdict de l'agent recalculé (R12) | Bloquante | | |
| R34 | Journal des contrôles | Administrateur : journal, filtres résultat et province | Contrôles de tous les agents, nom de l'agent, « Compte supprimé » pour un agent retiré | Majeure | | |
| R35 | Mot de passe oublié | Mon compte → se connecter → « Mot de passe oublié ? », saisir l'e-mail d'un compte existant, puis le code reçu et un nouveau mot de passe | E-mail reçu avec un code (sans lien) ; connexion directe ; reconnexion possible avec le nouveau mot de passe, plus avec l'ancien | Bloquante | | |
| R36 | Code erroné ou adresse inconnue | Saisir un mauvais code ; puis demander un code pour une adresse sans compte | « Code invalide ou expiré » ; pour l'adresse inconnue, même message de confirmation (aucune indication sur l'existence du compte) | Majeure | | |

## Procès-verbal

| Rôle | Nom | Décision (Accepté / Refusé) | Date | Signature |
| --- | --- | --- | --- | --- |
| Ingénieur QA | | | | |
| Lead Developer | | | | |
| Chef de projet produit | | | | |

Anomalies ouvertes au moment de la signature (référence, gravité, décision) :

-
