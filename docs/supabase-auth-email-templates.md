# Radiora Medical — Supabase Auth email templates

Branded, French-first replacements for Supabase's generic transactional auth
emails. **This file is documentation only** — copy/paste the HTML into the
Supabase Dashboard. No SMTP credentials live in the repo, and no email-provider
integration is wired here.

- **Default language:** French. Each template carries a short English line under
  the main French copy so non-French recipients aren't lost.
- **No external assets:** the wordmark, badge, and the Senegal accent bar are all
  pure HTML/CSS (table cells + `bgcolor`), so nothing depends on image hosting,
  and there are no tracking pixels.
- **No PHI:** templates reference only the recipient email and the action link —
  never patient or clinical data.
- **Mobile responsive:** a single 600 px centered card with a `@media` block that
  collapses padding on small screens. Layout is table-based for Outlook/Gmail.

## Brand tokens

| Token            | Value     | Use                                  |
| ---------------- | --------- | ------------------------------------ |
| Radiora blue     | `#2563EB` | Primary button, badge, links         |
| Radiora blue 700 | `#1D4ED8` | Button border / pressed accent       |
| Slate 900        | `#0F172A` | Headings                             |
| Slate 700        | `#334155` | Body text                            |
| Slate 500        | `#64748B` | Fine print / footer                  |
| Slate 200        | `#E2E8F0` | Borders / dividers                   |
| Slate 100        | `#F1F5F9` | Email background                     |
| Senegal green    | `#00853F` | Accent bar (decorative)              |
| Senegal gold     | `#D4A017` | Accent bar (decorative)              |
| Senegal red      | `#E31837` | Accent bar (decorative)              |

## Supabase template variables

These Go-template tokens are substituted by Supabase (GoTrue) at send time:

| Variable                | Meaning                                                        | Used in                          |
| ----------------------- | -------------------------------------------------------------- | -------------------------------- |
| `{{ .ConfirmationURL }}` | One-time action link (verify → `redirect_to`)                  | Invite, Confirm, Reset, Magic    |
| `{{ .Email }}`           | Recipient's email address                                      | All (shown as "envoyé à …")      |
| `{{ .SiteURL }}`         | Configured Site URL (e.g. `https://radiora.vercel.app`)        | Footer link                      |
| `{{ .Token }}`           | 6-digit one-time code (OTP)                                    | Magic link / OTP (optional)      |
| `{{ .TokenHash }}`       | Hashed token for building a custom verify URL                  | Only if you hand-build the URL   |

> The invite, confirm, reset, and magic-link templates here use
> `{{ .ConfirmationURL }}` — the simplest and least error-prone option, because
> Supabase appends the correct `redirect_to` automatically. `{{ .TokenHash }}` is
> only needed if you replace `{{ .ConfirmationURL }}` with a self-constructed
> `/auth/v1/verify?token_hash=…&type=…&redirect_to=…` link; the magic-link
> template notes where that would go.

---

## 1. Invite user

**Subject:** `Bienvenue sur Radiora Medical — activez votre compte`

**Preheader (first hidden line):** `Vous avez été invité à rejoindre Radiora Medical. Lien personnel, valable 24 h.`

### HTML

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Bienvenue sur Radiora Medical</title>
  <style>
    @media only screen and (max-width:600px) {
      .card { width:100% !important; border-radius:0 !important; }
      .pad  { padding-left:24px !important; padding-right:24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F1F5F9;">
  <!-- Preheader: hidden, shown as the inbox preview -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#F1F5F9; font-size:1px; line-height:1px;">
    Vous avez été invité à rejoindre Radiora Medical. Lien personnel, valable 24 h.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #E2E8F0; border-radius:14px; overflow:hidden;">

          <!-- Senegal accent bar -->
          <tr>
            <td style="padding:0; font-size:0; line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td height="4" bgcolor="#00853F" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  <td height="4" bgcolor="#D4A017" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  <td height="4" bgcolor="#E31837" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Brand header -->
          <tr>
            <td class="pad" align="center" style="padding:36px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px; vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="44" height="44" align="center" valign="middle" bgcolor="#2563EB"
                            style="width:44px; height:44px; border-radius:12px; color:#ffffff; font-family:Arial,Helvetica,sans-serif; font-size:22px; font-weight:bold; line-height:44px;">R</td>
                      </tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle; font-family:Arial,Helvetica,sans-serif; font-size:20px; font-weight:bold; color:#0F172A;">
                    Radiora&nbsp;Medical
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="pad" style="padding:16px 40px 8px 40px; font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:16px 0 4px 0; font-size:24px; line-height:1.3; color:#0F172A; font-weight:bold;">
                Bienvenue sur Radiora Medical
              </h1>
              <p style="margin:0 0 20px 0; font-size:16px; line-height:1.6; color:#334155;">
                Vous avez été invité à rejoindre <strong>Radiora Medical</strong>, la plateforme
                de comptes rendus radiologiques. Activez votre compte pour
                <strong>{{ .Email }}</strong> et créez votre mot de passe.
              </p>
              <p style="margin:0 0 28px 0; font-size:14px; line-height:1.6; color:#64748B;">
                You've been invited to join Radiora Medical. Activate your account below.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td class="pad" align="center" style="padding:0 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#2563EB" style="border-radius:8px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank"
                       style="display:inline-block; padding:14px 32px; font-family:Arial,Helvetica,sans-serif; font-size:16px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:8px; border:1px solid #1D4ED8;">
                      Activer mon compte
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Link fallback + expiry -->
          <tr>
            <td class="pad" style="padding:24px 40px 0 40px; font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:#64748B;">
                Ce lien est <strong>personnel</strong> et expire dans <strong>24 heures</strong>.
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
              </p>
              <p style="margin:0 0 20px 0; font-size:13px; line-height:1.5; word-break:break-all;">
                <a href="{{ .ConfirmationURL }}" target="_blank" style="color:#2563EB; text-decoration:underline;">{{ .ConfirmationURL }}</a>
              </p>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td class="pad" style="padding:0 40px 8px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#64748B;">
                    🔒 Vous n'attendiez pas cette invitation ? Ignorez simplement cet e-mail — aucun
                    compte ne sera créé sans votre action.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="pad" align="center" style="padding:28px 40px 36px 40px; font-family:Arial,Helvetica,sans-serif; border-top:1px solid #E2E8F0;">
              <p style="margin:18px 0 4px 0; font-size:13px; line-height:1.6; color:#64748B;">
                Conçu avec des radiologues sénégalais. 🇸🇳
              </p>
              <p style="margin:0; font-size:12px; line-height:1.6; color:#94A3B8;">
                Radiora Medical · <a href="{{ .SiteURL }}" target="_blank" style="color:#94A3B8; text-decoration:underline;">{{ .SiteURL }}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Plain-text fallback

```text
Bienvenue sur Radiora Medical

Vous avez été invité à rejoindre Radiora Medical, la plateforme de comptes
rendus radiologiques.

Activez votre compte pour {{ .Email }} et créez votre mot de passe :
{{ .ConfirmationURL }}

Ce lien est personnel et expire dans 24 heures.

Vous n'attendiez pas cette invitation ? Ignorez simplement cet e-mail —
aucun compte ne sera créé sans votre action.

Conçu avec des radiologues sénégalais.
Radiora Medical — {{ .SiteURL }}

---
You've been invited to join Radiora Medical. Activate your account using the
link above. This personal link expires in 24 hours. If you weren't expecting
this invitation, you can safely ignore this email.
```

---

## 2. Confirm signup

Used if/when self-service signup is enabled. The app currently onboards users by
invitation only, so this is **forward-looking** — paste it now so the experience
is consistent the day signup is turned on.

**Subject:** `Confirmez votre adresse e-mail — Radiora Medical`

**Preheader:** `Une dernière étape pour activer votre compte Radiora Medical.`

### HTML

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Confirmez votre e-mail</title>
  <style>
    @media only screen and (max-width:600px) {
      .card { width:100% !important; border-radius:0 !important; }
      .pad  { padding-left:24px !important; padding-right:24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F1F5F9;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#F1F5F9; font-size:1px; line-height:1px;">
    Une dernière étape pour activer votre compte Radiora Medical.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #E2E8F0; border-radius:14px; overflow:hidden;">
          <tr>
            <td style="padding:0; font-size:0; line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td height="4" bgcolor="#00853F" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  <td height="4" bgcolor="#D4A017" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  <td height="4" bgcolor="#E31837" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:36px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px; vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr><td width="44" height="44" align="center" valign="middle" bgcolor="#2563EB"
                          style="width:44px; height:44px; border-radius:12px; color:#ffffff; font-family:Arial,Helvetica,sans-serif; font-size:22px; font-weight:bold; line-height:44px;">R</td></tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle; font-family:Arial,Helvetica,sans-serif; font-size:20px; font-weight:bold; color:#0F172A;">Radiora&nbsp;Medical</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:16px 40px 8px 40px; font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:16px 0 4px 0; font-size:24px; line-height:1.3; color:#0F172A; font-weight:bold;">Confirmez votre adresse e-mail</h1>
              <p style="margin:0 0 20px 0; font-size:16px; line-height:1.6; color:#334155;">
                Merci de votre inscription. Confirmez <strong>{{ .Email }}</strong> pour activer votre compte Radiora Medical.
              </p>
              <p style="margin:0 0 28px 0; font-size:14px; line-height:1.6; color:#64748B;">Confirm your email address to finish setting up your account.</p>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:0 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#2563EB" style="border-radius:8px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank"
                       style="display:inline-block; padding:14px 32px; font-family:Arial,Helvetica,sans-serif; font-size:16px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:8px; border:1px solid #1D4ED8;">Confirmer mon e-mail</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:24px 40px 0 40px; font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:#64748B;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
              </p>
              <p style="margin:0 0 20px 0; font-size:13px; line-height:1.5; word-break:break-all;">
                <a href="{{ .ConfirmationURL }}" target="_blank" style="color:#2563EB; text-decoration:underline;">{{ .ConfirmationURL }}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:0 40px 8px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;">
                <tr><td style="padding:14px 16px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#64748B;">
                  🔒 Vous n'êtes pas à l'origine de cette inscription ? Ignorez cet e-mail.
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:28px 40px 36px 40px; font-family:Arial,Helvetica,sans-serif; border-top:1px solid #E2E8F0;">
              <p style="margin:18px 0 4px 0; font-size:13px; line-height:1.6; color:#64748B;">Conçu avec des radiologues sénégalais. 🇸🇳</p>
              <p style="margin:0; font-size:12px; line-height:1.6; color:#94A3B8;">Radiora Medical · <a href="{{ .SiteURL }}" target="_blank" style="color:#94A3B8; text-decoration:underline;">{{ .SiteURL }}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Plain-text fallback

```text
Confirmez votre adresse e-mail — Radiora Medical

Merci de votre inscription. Confirmez {{ .Email }} pour activer votre compte :
{{ .ConfirmationURL }}

Vous n'êtes pas à l'origine de cette inscription ? Ignorez cet e-mail.

Conçu avec des radiologues sénégalais.
Radiora Medical — {{ .SiteURL }}
```

---

## 3. Reset password

Forward-looking (no in-app "forgot password" flow is wired yet). Paste it so the
template is ready when `resetPasswordForEmail()` is added.

**Subject:** `Réinitialisez votre mot de passe — Radiora Medical`

**Preheader:** `Lien sécurisé pour choisir un nouveau mot de passe. Valable 1 heure.`

### HTML

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Réinitialisez votre mot de passe</title>
  <style>
    @media only screen and (max-width:600px) {
      .card { width:100% !important; border-radius:0 !important; }
      .pad  { padding-left:24px !important; padding-right:24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F1F5F9;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#F1F5F9; font-size:1px; line-height:1px;">
    Lien sécurisé pour choisir un nouveau mot de passe. Valable 1 heure.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #E2E8F0; border-radius:14px; overflow:hidden;">
          <tr>
            <td style="padding:0; font-size:0; line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td height="4" bgcolor="#00853F" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  <td height="4" bgcolor="#D4A017" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  <td height="4" bgcolor="#E31837" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:36px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px; vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr><td width="44" height="44" align="center" valign="middle" bgcolor="#2563EB"
                          style="width:44px; height:44px; border-radius:12px; color:#ffffff; font-family:Arial,Helvetica,sans-serif; font-size:22px; font-weight:bold; line-height:44px;">R</td></tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle; font-family:Arial,Helvetica,sans-serif; font-size:20px; font-weight:bold; color:#0F172A;">Radiora&nbsp;Medical</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:16px 40px 8px 40px; font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:16px 0 4px 0; font-size:24px; line-height:1.3; color:#0F172A; font-weight:bold;">Réinitialisez votre mot de passe</h1>
              <p style="margin:0 0 20px 0; font-size:16px; line-height:1.6; color:#334155;">
                Nous avons reçu une demande de réinitialisation du mot de passe pour
                <strong>{{ .Email }}</strong>. Choisissez un nouveau mot de passe en toute sécurité.
              </p>
              <p style="margin:0 0 28px 0; font-size:14px; line-height:1.6; color:#64748B;">Reset the password for your Radiora Medical account.</p>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:0 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#2563EB" style="border-radius:8px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank"
                       style="display:inline-block; padding:14px 32px; font-family:Arial,Helvetica,sans-serif; font-size:16px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:8px; border:1px solid #1D4ED8;">Choisir un nouveau mot de passe</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:24px 40px 0 40px; font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:#64748B;">
                Ce lien expire bientôt. Si le bouton ne fonctionne pas, copiez ce lien :
              </p>
              <p style="margin:0 0 20px 0; font-size:13px; line-height:1.5; word-break:break-all;">
                <a href="{{ .ConfirmationURL }}" target="_blank" style="color:#2563EB; text-decoration:underline;">{{ .ConfirmationURL }}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:0 40px 8px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;">
                <tr><td style="padding:14px 16px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#64748B;">
                  🔒 Vous n'avez pas demandé cette réinitialisation ? Ignorez cet e-mail — votre mot de passe reste inchangé.
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:28px 40px 36px 40px; font-family:Arial,Helvetica,sans-serif; border-top:1px solid #E2E8F0;">
              <p style="margin:18px 0 4px 0; font-size:13px; line-height:1.6; color:#64748B;">Conçu avec des radiologues sénégalais. 🇸🇳</p>
              <p style="margin:0; font-size:12px; line-height:1.6; color:#94A3B8;">Radiora Medical · <a href="{{ .SiteURL }}" target="_blank" style="color:#94A3B8; text-decoration:underline;">{{ .SiteURL }}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Plain-text fallback

```text
Réinitialisez votre mot de passe — Radiora Medical

Nous avons reçu une demande de réinitialisation du mot de passe pour {{ .Email }}.
Choisissez un nouveau mot de passe :
{{ .ConfirmationURL }}

Vous n'avez pas demandé cette réinitialisation ? Ignorez cet e-mail — votre mot
de passe reste inchangé.

Conçu avec des radiologues sénégalais.
Radiora Medical — {{ .SiteURL }}
```

---

## 4. Magic link / OTP (optional — not currently used)

The app authenticates with email + password (`signInWithPassword`), so **no
magic-link or OTP flow is wired today**. This template is included for
completeness; paste it only if you later enable `signInWithOtp()`.

It shows **both** a one-click link (`{{ .ConfirmationURL }}`) and the 6-digit
code (`{{ .Token }}`) so it works for either the magic-link or OTP variant.

> If you build the verify URL yourself instead of using `{{ .ConfirmationURL }}`,
> that is the only place `{{ .TokenHash }}` is needed, e.g.:
> `{{ .SiteURL }}/auth/v1/verify?token_hash={{ .TokenHash }}&type=magiclink&redirect_to={{ .SiteURL }}/fr/dashboard`

**Subject:** `Votre lien de connexion — Radiora Medical`

**Preheader:** `Connectez-vous à Radiora Medical. Lien et code valables quelques minutes.`

### HTML

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Votre lien de connexion</title>
  <style>
    @media only screen and (max-width:600px) {
      .card { width:100% !important; border-radius:0 !important; }
      .pad  { padding-left:24px !important; padding-right:24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F1F5F9;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#F1F5F9; font-size:1px; line-height:1px;">
    Connectez-vous à Radiora Medical. Lien et code valables quelques minutes.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #E2E8F0; border-radius:14px; overflow:hidden;">
          <tr>
            <td style="padding:0; font-size:0; line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td height="4" bgcolor="#00853F" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  <td height="4" bgcolor="#D4A017" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  <td height="4" bgcolor="#E31837" style="height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:36px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px; vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr><td width="44" height="44" align="center" valign="middle" bgcolor="#2563EB"
                          style="width:44px; height:44px; border-radius:12px; color:#ffffff; font-family:Arial,Helvetica,sans-serif; font-size:22px; font-weight:bold; line-height:44px;">R</td></tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle; font-family:Arial,Helvetica,sans-serif; font-size:20px; font-weight:bold; color:#0F172A;">Radiora&nbsp;Medical</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:16px 40px 8px 40px; font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:16px 0 4px 0; font-size:24px; line-height:1.3; color:#0F172A; font-weight:bold;">Votre lien de connexion</h1>
              <p style="margin:0 0 20px 0; font-size:16px; line-height:1.6; color:#334155;">
                Connectez-vous à Radiora Medical avec <strong>{{ .Email }}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:0 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#2563EB" style="border-radius:8px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank"
                       style="display:inline-block; padding:14px 32px; font-family:Arial,Helvetica,sans-serif; font-size:16px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:8px; border:1px solid #1D4ED8;">Se connecter</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:24px 40px 0 40px; font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:#64748B;">Ou saisissez ce code :</p>
              <p style="margin:0 0 20px 0; font-size:30px; letter-spacing:6px; font-weight:bold; color:#0F172A;">{{ .Token }}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:0 40px 8px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;">
                <tr><td style="padding:14px 16px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#64748B;">
                  🔒 Vous n'avez pas demandé à vous connecter ? Ignorez cet e-mail.
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:28px 40px 36px 40px; font-family:Arial,Helvetica,sans-serif; border-top:1px solid #E2E8F0;">
              <p style="margin:18px 0 4px 0; font-size:13px; line-height:1.6; color:#64748B;">Conçu avec des radiologues sénégalais. 🇸🇳</p>
              <p style="margin:0; font-size:12px; line-height:1.6; color:#94A3B8;">Radiora Medical · <a href="{{ .SiteURL }}" target="_blank" style="color:#94A3B8; text-decoration:underline;">{{ .SiteURL }}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Plain-text fallback

```text
Votre lien de connexion — Radiora Medical

Connectez-vous à Radiora Medical avec {{ .Email }} :
{{ .ConfirmationURL }}

Ou saisissez ce code : {{ .Token }}

Vous n'avez pas demandé à vous connecter ? Ignorez cet e-mail.

Conçu avec des radiologues sénégalais.
Radiora Medical — {{ .SiteURL }}
```

---

## Setup instructions (Supabase Dashboard)

For each template above:

1. Open the **Supabase Dashboard** for the Radiora project.
2. Go to **Authentication → Email Templates**.
3. Select the matching tab:
   - **Invite User** → paste the *Invite user* HTML
   - **Confirm signup** → paste the *Confirm signup* HTML
   - **Reset Password** → paste the *Reset password* HTML
   - **Magic Link** → paste the *Magic link / OTP* HTML (only if OTP is enabled)
4. Paste the **Subject** into the subject field and the **HTML** into the message body.
5. Click **Save**.
6. Repeat for each template.

> **Plain-text:** the Dashboard editor stores a single HTML body; email clients
> auto-generate a text part from it. The plain-text blocks above are the
> canonical fallback copy — keep them in sync if you edit the HTML, and use them
> directly if you later send via the Management API or a custom SMTP provider
> that accepts a separate text part.

## Configuration checklist

Before testing, confirm in **Authentication → URL Configuration**:

- [ ] **Site URL** = `https://radiora.vercel.app`
- [ ] **Redirect URLs** include both locales of the invite-acceptance route:
  - [ ] `https://radiora.vercel.app/fr/accept-invite`
  - [ ] `https://radiora.vercel.app/en/accept-invite`
  - [ ] (optional, for local testing) `http://localhost:3000/fr/accept-invite` and `http://localhost:3000/en/accept-invite`
- [ ] **`NEXT_PUBLIC_SITE_URL`** env var matches the Site URL (used by the invite
      server action to build `redirectTo`).
- [ ] Templates pasted and saved for **Invite User** (required) — Confirm /
      Reset / Magic Link as needed.

Then verify end-to-end:

- [ ] Invite a **new** email from the Radiora **Users** page.
- [ ] Open the email in **incognito / private window** (no existing session).
- [ ] Confirm the branded email renders (badge, blue CTA, Senegal accent bar, no
      broken images).
- [ ] Click **Activer mon compte** → lands on `/fr/accept-invite` → set password →
      reach the dashboard.
- [ ] Re-open the same link in a window where an **admin is already signed in** →
      the "already signed in as X" conflict screen appears (not a silent
      redirect).
- [ ] Confirm the link is rejected after **24 hours** (or after first use).

## Notes & constraints

- **No SMTP credentials in code.** Provider/SMTP settings live only in the
  Supabase Dashboard (**Project Settings → Authentication → SMTP**). Nothing in
  this repo stores or reads them.
- **No email-provider integration added.** This change is documentation +
  templates only. Sending continues to use Supabase's built-in auth mailer (the
  existing mechanism), not a new external vendor.
- **Management API option (only if already configured):** the same HTML can be
  pushed via `PATCH /v1/projects/{ref}/config/auth` with
  `mailer_templates_invite_content`, `…_confirmation_content`,
  `…_recovery_content`, `…_magic_link_content`. Do **not** add an access token to
  the repo or CI to do this — apply it manually only if a token is already
  available in a secure context.
- **No PHI** appears in any template — only the recipient email and the action
  link/code.
- **Outlook:** the layout is table-based with `bgcolor` on the button cell for
  reasonable rendering. If pixel-perfect Outlook desktop support is later
  required, add VML button fallbacks — not included here to keep the templates
  copy-paste simple.
