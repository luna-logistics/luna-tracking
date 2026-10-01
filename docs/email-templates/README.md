# E-mails d'authentification (Supabase Auth)

Les e-mails « mot de passe oublié » et « confirmation de compte » sont envoyés par Supabase Auth, pas par le site. Leur texte et leur expéditeur se règlent dans le tableau de bord Supabase, pas dans le code.

## 1. Texte des e-mails
Supabase → **Authentication → Email Templates**.

| Modèle | Objet | Contenu à coller |
|---|---|---|
| Reset Password | `Réinitialisation de votre mot de passe — Luna Tracking Logistics` | `recovery.html` |
| Confirm signup | `Confirmez votre adresse e-mail — Luna Tracking Logistics` | `confirm-signup.html` |

Les modèles sont bilingues (FR puis EN) car Supabase n'en propose qu'un par type. Ne pas modifier `{{ .ConfirmationURL }}`.

## 2. Expéditeur (« Supabase » → « Luna »)
Tant que Supabase envoie avec son SMTP par défaut, l'expéditeur reste « Supabase Auth ». Pour afficher Luna :

Supabase → **Authentication → Emails → SMTP Settings** → activer **Custom SMTP** :

- Sender email : `support@lunatrackinglogistics.com` (domaine déjà vérifié dans Resend)
- Sender name : `Luna Tracking Logistics`
- Host : `smtp.resend.com`, port `465`
- Username : `resend`
- Password : une clé API Resend (créez-en une dédiée à l'envoi, ne réutilisez pas celle des Edge Functions)

## 3. Redirections autorisées
Supabase → **Authentication → URL Configuration** : Site URL `https://lunatrackinglogistics.com`, et `https://lunatrackinglogistics.com/**` dans Redirect URLs.
