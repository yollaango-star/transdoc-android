# Clé de signature de RECETTE

`transdoc-recette.p12` signe les APK de recette (push sur `main`, lancement manuel) quand la clé officielle n'est pas fournie.
Elle est **publique par choix** (mot de passe : `transdoc-recette`) : son seul rôle est de garder la même signature d'une
compilation à l'autre, pour que chaque nouvel APK de recette s'installe par-dessus le précédent.

- Ne jamais l'utiliser pour une version publiée : la CI refuse tout tag `v*` sans la clé officielle (secrets `TRANSDOC_KEYSTORE_*`).
- Un téléphone qui a la version officielle ne peut pas installer un APK de recette par-dessus (signatures différentes), et inversement.
