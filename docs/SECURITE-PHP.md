# Sécurité PHP — Luna Tracking Logistics

Dernière revue : 2026-10-22 (alerte php.net du 2026-10-21, CVE-2026-109618 et CVE-2026-109619, CERT-FR CERTFR-2026-ALE-014).

## 1. Où tourne du PHP chez Luna

| Environnement | PHP ? | Détail |
|---|---|---|
| **Production** (lunatrackinglogistics.com) | **Non** | Frontend : Cloudflare Workers (assets statiques + `worker.js`). Backend : Supabase (Postgres, fonctions Edge en Deno). DNS : Cloudflare. |
| **Dépôt git** | **Non** | Aucun `.php`, `.htaccess`, `composer.*` suivi. Un seul `.php` existe dans `node_modules` (librairie JS `flatted`). |
| **Poste de développement** | **Oui, hors production** | PHP intégré à WordPress Studio (site local `woocommerce-test`, port 8881, `phpVersion=8.4`). |
| **`C:\xampp`** | Inactif | Seul `phpMyAdmin.old` (renommé le 2026-10-22, pas supprimé). Pas de `php.exe`, pas d'Apache. |

Si un autre hébergement PHP lié à Luna existe (messagerie, sous-domaine, ancien site), il n'est **pas couvert** par ce document : l'ajouter ici dès qu'il est connu.

## 2. Versions PHP corrigées (alerte du 2026-10-21)

| Branche | Version corrigée |
|---|---|
| 8.5 | 8.5.12 |
| 8.4 | 8.4.27 |
| 8.3 | 8.3.36 |
| 8.2 | 8.2.35 (fin de vie le 2026-12-31) |

PHP 8.1 et plus ancien : aucun correctif du projet PHP. Source : <https://www.php.net/archive/2026.php>.

## 3. Poste de développement : WordPress Studio

- **Version qui embarque un PHP corrigé : Studio 2.0.4** (publiée le 21 octobre). Ses notes de version indiquent : « Update the bundled PHP binaries to 8.2.35, 8.3.36, 8.4.27 and 8.5.12 ». Source : <https://github.com/Automattic/studio/releases/tag/v2.0.4>. Les notes ne parlent pas de sécurité.
- Version installée au 2026-10-22 : 1.22.0 (PHP 8.4.25), avec des restes de 1.21.0 (8.4.24). Les deux sont **exposées**.
- **Réseau (lu dans le code de Studio 1.22.0, sans lancer de site)** : le PHP écoute sur `127.0.0.1` (port aléatoire) et le proxy du site sur `localhost:<port>`. Rien n'est exposé sur le réseau local tant que le site n'utilise pas de domaine personnalisé. Le démon proxy de Studio écoute sur les ports 80 et 443 **sans adresse imposée** . [HYPOTHÈSE NON VÉRIFIÉE] : il ne sert qu'aux domaines personnalisés (le code parle de SNI et de certificats). `woocommerce-test` a `enableHttps=False`, et rien n'écoute sur 80/443 aujourd'hui.

### Procédure de mise à jour

1. Fermer Studio et arrêter les sites.
2. Installer Studio 2.0.4 ou plus récent depuis la page officielle de téléchargement (ou la mise à jour intégrée à l'application, si elle la propose).
3. Relancer `pnpm check-php` (voir §5) : la ligne `Studio app-… : PHP …` doit afficher « corrigé ».
4. Les anciens dossiers `studio_app\app-1.21.0` / `app-1.22.0` et `~\.studio\php-bin\8.4.24-studio-2` peuvent rester après la mise à jour. Le script les signale en `WARN` s'ils sont exposés. Les supprimer à la main une fois la 2.x validée.

Annulation : réinstaller l'ancienne version de Studio. C'est un retour à un PHP vulnérable, à éviter.

## 4. Garde-fous dans le dépôt

- **Build** : `pnpm build` exécute `check-php-exposure.mjs --ci` après `vite build`. Il échoue si un fichier PHP (`.php`, `.phtml`, `.phar`, `.htaccess`, `.user.ini`, `php.ini`, `composer.*`) se trouve dans `public/` ou `dist/`, ou est suivi par git. Il échoue aussi si une CSP **bloquante** apparaît dans `public/_headers`.
- **CSP en `Report-Only`** (`public/_headers`) : ne bloque rien, le navigateur écrit seulement `[Report Only] Refused to …` dans la console. Il n'y a **pas de collecteur** (`report-uri`) : les violations ne sont visibles que dans la console du navigateur de la personne qui visite.
- **Pas de Permissions-Policy** : elle n'a pas de mode « rapport seul » exploitable, elle bloquerait donc directement.

### Ce que la CSP Report-Only laisse passer / signalerait

Autorisé : le site lui-même ; Supabase (REST, auth, fonctions, realtime, images de stockage) ; Cloudflare Turnstile (script + cadre) ; `gtag` et Google Analytics ; pixel Meta ; carte Google Maps (cadre de la page Contact) ; API GitHub (statut de reconstruction, admin) ; polices et images locales, `data:` et `blob:`.

Serait signalé (n'est pas bloqué) : tout autre domaine de script, image, connexion ou cadre ; les scripts inline ; Stripe.js ; `object`/`embed`.

Vérifié le 2026-10-22 dans le navigateur intégré (serveur local servant `dist/` avec l'en-tête) : Turnstile, gtag, pixel Meta, carte Google, Supabase (REST et fonctions), Google Analytics, Meta et GitHub **n'ont produit aucune violation**. Stripe.js et un faux domaine ont bien été signalés.

- **Stripe** : Stripe Checkout est une page hébergée atteinte par redirection : aucune entrée CSP n'est nécessaire. Si on passe un jour à Stripe Elements / Stripe.js, il faudra ajouter `https://js.stripe.com` en `script-src`, `connect-src` et `frame-src`.
- **Non vérifié** : le test local n'avait pas les variables Supabase, donc pas de vrais appels de l'application. Les requêtes secondaires déclenchées par `gtag` et le pixel Meta après consentement (par exemple vers d'autres domaines Google) n'ont pas été observées. **À faire après déploiement** : parcourir le site avec la console ouverte, relever les lignes `[Report Only]`, compléter la liste.
- Ne passer en CSP bloquante qu'après cette revue, et après avoir testé : suivi, devis, paiement, connexion, envoi de documents.

## 5. Vérification automatique — à relancer à chaque alerte PHP

```bash
cd app/frontend
pnpm check-php               # contrôle complet
pnpm check-php -- --offline  # sans requête vers la production
pnpm test:php-exposure       # tests du script lui-même
```

Ce que le script contrôle : fichiers PHP dans `public/`, `dist/` et git ; empreintes PHP/Apache/LiteSpeed en production (`X-Powered-By`, `Server`, `/index.php`, `/wp-login.php`) ; versions PHP de Studio, de XAMPP/Laragon/WAMP s'ils existent et de `php` dans le PATH ; absence de CSP bloquante. Il ne lit aucun secret ni `.env` et ne lance aucun site.

Code retour `1` s'il y a un `FAIL`. Les `WARN` n'échouent pas.

## 6. Checklist à relancer à chaque alerte PHP

1. **Lire l'avis officiel** : <https://www.php.net/archive/2026.php> (ou l'année en cours) et l'alerte CERT-FR. Noter les CVE, les versions corrigées et les contournements.
2. **Mettre à jour `FIXED_PHP`** en tête de `app/frontend/scripts/check-php-exposure.mjs`, et la table du §2 ci-dessus.
3. Lancer `pnpm check-php` et lire chaque ligne.
4. **Production** : vérifier qu'aucun PHP n'est apparu (nouvel hébergement, sous-domaine, messagerie web, ancien site). Regarder les enregistrements DNS dans Cloudflare.
5. **Poste** : mettre à jour Studio (§3) ou tout autre PHP local ; contrôler `php -v`.
6. **Notes de version Studio** : chercher « Update the bundled PHP binaries » et la version de PHP citée.
7. **Journaux** : si un PHP exposé à Internet existait, consulter ses journaux d'accès et d'erreur (requêtes multipart inhabituelles, erreurs mémoire, HTTP 500 répétés, `PHPSESSID` très gros) et ne rien supprimer en cas de doute.
8. **Secrets** : uniquement s'il y a eu un PHP exposé et vulnérable ou un indice de compromission → ordre de rotation : clés Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GITHUB_REBUILD_TOKEN`, `CLOUDFLARE_API_TOKEN`, `DEEPL_API_KEY`, `FILEMAKER_PASSWORD`. Voir les emplacements au §7.
9. Mettre à jour la date de « Dernière revue » en haut de ce document.

## 7. Secrets manipulés (noms seulement)

- **Supabase → Edge Functions → Secrets** : `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ALLOW_LIVE`, `RESEND_API_KEY`, `DEEPL_API_KEY`, `FILEMAKER_PASSWORD`, `GITHUB_REBUILD_TOKEN` (+ `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_REF`, `GITHUB_WORKFLOW`), `SITE_URL`.
- **Cloudflare Worker** : `SUPABASE_URL`, `SUPABASE_ANON_KEY` (valeurs publiques par conception).
- **GitHub Actions → Secrets** : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Poste** : `.env.local` (ignoré par git ; seul `.env.local.example` est suivi).

## 8. Contacts

- **Hébergeur** : aucun hébergeur PHP. Fournisseurs du site : Cloudflare (hébergement et DNS), Supabase (base et fonctions).
- À compléter ici si un autre hébergement PHP est identifié.

## 9. Limites connues

- La production n'a pas été auditée côté applicatif TypeScript / Edge Functions / règles RLS Supabase : autre chantier.
- Les journaux Cloudflare et Supabase n'ont pas été consultés.
- Le script ne voit pas un PHP qui serait hébergé ailleurs que sur ce poste et sur le domaine principal (il ne teste que `https://lunatrackinglogistics.com`).
