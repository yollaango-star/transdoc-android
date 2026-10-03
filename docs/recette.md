# Cahier de recette TransDoc v1.0.0

À dérouler avant toute publication d'une version (tag `v*`), sur l'APK compilé par la CI et sur le registre de **recette** (`transdoc-test`).
Une ligne en échec avec la gravité « Bloquante » interdit la mise en production.

## Conditions

| Élément | Valeur attendue |
| --- | --- |
| APK | Artifact `TransDoc-apk` de la dernière exécution verte de la CI (jobs `tests` et `apk`) |
| Appareils | 3 au minimum : Android 8 (API 26), Android 11 (API 30), Android 14 (API 34) |
| Comptes | 1 propriétaire A, 1 propriétaire B, 1 agent, 1 administrateur DGTT (rôles attribués par l'administrateur) |
| Réseau | Chaque parcours marqué « hors ligne » est rejoué en mode avion |
| Registre | Migrations à jour, `seed.sql` appliqué (plaques `DEMO-…`) |

## Parcours

| ID | Parcours | Étapes | Résultat attendu | Gravité | Résultat | Testeur / date |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | Premier lancement | Installer l'APK, ouvrir | Accueil affiché, bandeau « Connexion au registre national… » puis disparu, profil anonyme créé | Bloquante | | |
| R02 | Inscription refusée sans compte | Profil anonyme : inscrire un véhicule | Refus avec le message « Ajoutez et confirmez votre e-mail… » ; aucun véhicule créé | Bloquante | | |
| R03 | Sécuriser le compte | Mon accès → ajouter un e-mail → ouvrir le lien reçu → revenir dans l'app | Toast « E-mail confirmé », formulaire mot de passe proposé | Bloquante | | |
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
| R19 | Accès réservés | Propriétaire : ouvrir contrôle / statistiques | Refus « Réservé aux agents » | Bloquante | | |
| R20 | Rôles | Administrateur : nommer puis retirer un agent | Droits appliqués au prochain lancement de l'agent | Bloquante | | |
| R21 | Réclamation de plaque | Administrateur : `admin_reattribuer_vehicule` vers le vrai propriétaire | Véhicule transféré, pièces redevenues « déclarées » | Majeure | | |
| R22 | Tableau de bord | Agent : statistiques, filtres catégorie et « démonstration » | Chiffres par province cohérents, aucune donnée personnelle | Majeure | | |
| R23 | Suppression du compte | Mon accès → Supprimer mon compte | Compte et véhicules supprimés, plaque de nouveau libre | Bloquante | | |
| R24 | Retour Android | Ouvrir une fenêtre, appui sur Retour | La fenêtre se ferme, l'app reste ouverte | Mineure | | |
| R25 | Rotation, mode sombre | Pivoter l'écran ; activer le thème sombre | Pas de perte de saisie, contrastes lisibles | Mineure | | |
| R26 | Mise à jour | Installer la nouvelle version par-dessus la précédente | Mise à jour acceptée (même clé de signature), session conservée | Bloquante | | |

## Procès-verbal

| Rôle | Nom | Décision (Accepté / Refusé) | Date | Signature |
| --- | --- | --- | --- | --- |
| Ingénieur QA | | | | |
| Lead Developer | | | | |
| Chef de projet produit | | | | |

Anomalies ouvertes au moment de la signature (référence, gravité, décision) :

-
