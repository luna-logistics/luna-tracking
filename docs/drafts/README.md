# Brouillons à valider — cluster douane RDC

Ces fichiers sont des **brouillons d'articles de blog, NON publiés**. Ils ne sont
pas câblés au site : ni dans `src`, ni dans le registre de routes, ni dans le
sitemap, ni dans `llms.txt`. Ils ne sont visibles nulle part en ligne.

Ils couvrent l'opportunité SEO n°3 de l'audit du 2026-10-01 (cluster « douane
RDC » : dédouanement + documents), qui complète l'article Incoterms déjà en
ligne.

| Fichier | Article | Langue | Cible de publication (à créer après validation) |
|---|---|---|---|
| `dedouanement-rdc.fr.md` | Dédouanement RDC (DGDA/OCC) | FR | `/blog/dedouanement-colis-rdc` |
| `dedouanement-rdc.en.md` | Customs clearance DRC | EN | `/en/blog/customs-clearance-drc` |
| `documents-douane-rdc.fr.md` | Documents douaniers RDC | FR | `/blog/documents-douane-rdc` |
| `documents-douane-rdc.en.md` | Customs documents DRC | EN | `/en/blog/customs-documents-drc` |

## Pourquoi une validation est indispensable

Une information douanière erronée est un risque pour l'entreprise (retard,
surcoût, blocage d'un envoi client). Chaque affirmation réglementaire non
confirmée par une source officielle est marquée **[À VÉRIFIER] / [TO VERIFY]**.
Les affirmations confirmées portent la mention **[CONFIRMÉ … source] /
[CONFIRMED … source]** avec la source correspondante listée en bas de chaque
article.

## Points principaux à trancher (résumé)

- Taux de droits de douane et de TVA à l'import (volontairement non chiffrés).
- Seuil d'inspection avant embarquement (2 500 USD) à la date de publication.
- Caractère obligatoire et modalités du FERI / ECTN.
- Applicabilité des formulaires CN22 / CN23 aux envois Luna (fret, pas poste).
- Ce que Luna prend réellement en charge dans le dédouanement.
- Pièces minimales pour un envoi de particulier.

## Pour publier (plus tard)

Ces articles sont des billets de blog : la publication se fait via l'admin
(`/admin/blog`), qui alimente la table `blog_posts` (slug FR/EN, FAQ, etc.) —
pas en ajoutant des fichiers au dépôt. Le prerender et le sitemap récupèrent
ensuite les billets publiés automatiquement.
