# Radiora Medical
## Guide Utilisateur Pilote

**Plateforme intelligente de gestion des comptes rendus radiologiques**

---

| | |
|---|---|
| **Version** | 1.0 — Phase Pilote |
| **Date** | Mai 2026 |
| **Classification** | CONFIDENTIEL — Usage Pilote Uniquement |
| **Destinataires** | Radiologues, Administrateurs de Clinique, Personnel d'Imagerie Médicale |

---

*Conçu pour les cliniques et centres d'imagerie en Afrique francophone.*

---

> ⚠️ **Document Confidentiel.** Ce guide est destiné exclusivement aux participants à la phase pilote de Radiora Medical. Merci de ne pas le diffuser en dehors de votre établissement.

---

## Table des Matières

1. [Introduction](#1-introduction)
2. [Configuration Requise](#2-configuration-requise)
3. [Connexion à la Plateforme](#3-connexion-à-la-plateforme)
4. [Vue d'Ensemble du Tableau de Bord](#4-vue-densemble-du-tableau-de-bord)
5. [Gestion des Patients](#5-gestion-des-patients)
6. [Flux de Travail des Examens](#6-flux-de-travail-des-examens)
7. [Flux de Travail des Comptes Rendus](#7-flux-de-travail-des-comptes-rendus)
8. [Fonctionnalités IA — Vue d'Ensemble](#8-fonctionnalités-ia--vue-densemble)
9. [Résultats IA Externes](#9-résultats-ia-externes)
10. [Audit et Traçabilité](#10-audit-et-traçabilité)
11. [Sécurité et Confidentialité](#11-sécurité-et-confidentialité)
12. [Résolution de Problèmes](#12-résolution-de-problèmes)
13. [Retours Pilote](#13-retours-pilote)
14. [Démarrage Rapide](#14-démarrage-rapide)
15. [Contacts et Support](#15-contacts-et-support)

---

## 1. Introduction

### Qu'est-ce que Radiora Medical ?

Radiora Medical est une plateforme numérique de gestion des comptes rendus radiologiques, conçue spécifiquement pour les cliniques et centres d'imagerie médicale en Afrique francophone.

Elle permet à votre établissement de :

- Gérer les dossiers patients et les examens d'imagerie de manière centralisée
- Rédiger, structurer et finaliser des comptes rendus radiologiques
- Utiliser des outils d'assistance par intelligence artificielle pour gagner en efficacité
- Assurer la traçabilité complète de toutes les actions cliniques
- Suivre les indicateurs de performance de votre service d'imagerie

### Objectif de la Phase Pilote

Vous participez à la **phase pilote** de Radiora Medical. Cette phase a pour but de :

1. Tester la plateforme dans des conditions réelles d'utilisation clinique
2. Recueillir vos retours pour améliorer l'expérience utilisateur
3. Identifier les fonctionnalités prioritaires pour votre établissement
4. Former votre équipe avant le déploiement définitif

> ℹ️ **Information :** Durant la phase pilote, toutes les données saisies sont réelles mais protégées. L'environnement de production sera distinct de l'environnement de test si nécessaire. Vérifiez avec votre administrateur.

### Rappel Important sur les Fonctionnalités IA

> ⚠️ **AVERTISSEMENT CLINIQUE IMPORTANT**
>
> Les fonctionnalités d'intelligence artificielle intégrées à Radiora Medical sont des **outils d'assistance** destinés à améliorer la productivité du clinicien.
>
> - Les suggestions générées par l'IA **doivent toujours être relues, vérifiées et validées** par un professionnel de santé qualifié avant toute finalisation.
> - Radiora Medical **ne remplace pas** le jugement médical ni la responsabilité professionnelle du radiologue.
> - Le clinicien reste seul responsable du contenu de chaque compte rendu signé.

---

## 2. Configuration Requise

### Navigateurs Recommandés

| Navigateur | Version Minimale | Recommandé |
|---|---|---|
| Google Chrome | 110+ | ✅ Recommandé |
| Mozilla Firefox | 110+ | ✅ Recommandé |
| Microsoft Edge | 110+ | ✅ Compatible |
| Safari | 16+ | ⚠️ Compatible avec limitations |
| Internet Explorer | Toutes versions | ❌ Non supporté |

### Prérequis Techniques

| Élément | Exigence |
|---|---|
| **Connexion Internet** | Haut débit stable (minimum 5 Mbps) |
| **Protocole** | HTTPS obligatoire — accès sécurisé uniquement |
| **Microphone** | Requis pour la dictée vocale (intégré ou USB) |
| **Écran** | Résolution minimale 1280 × 720 px |
| **Cookies** | Doit être activé dans le navigateur |
| **JavaScript** | Doit être activé dans le navigateur |

> 💡 **Conseil :** Pour une expérience optimale, utilisez Google Chrome sur un ordinateur de bureau ou un ordinateur portable. L'accès mobile est supporté mais certaines fonctionnalités sont optimisées pour grands écrans.

> ⚠️ **Attention :** N'utilisez jamais la plateforme sur un réseau Wi-Fi public non sécurisé. Préférez le réseau de votre établissement ou une connexion mobile sécurisée.

---

## 3. Connexion à la Plateforme

### Accès à la Plateforme

Ouvrez votre navigateur et accédez à l'adresse fournie par votre administrateur :

```
https://radiora.vercel.app
```

La plateforme vous redirigera automatiquement vers la page de connexion.

### Étapes de Connexion

**Étape 1.** Accédez à la page de connexion (`/fr/login`).

**Étape 2.** Saisissez votre **adresse e-mail professionnelle** dans le champ « E-mail ».

**Étape 3.** Saisissez votre **mot de passe** dans le champ « Mot de passe ».

**Étape 4.** Cochez « Se souvenir de moi » si vous êtes sur votre poste personnel sécurisé.

**Étape 5.** Cliquez sur **« Se connecter »**.

Après connexion réussie, vous serez redirigé automatiquement vers le tableau de bord.

### Changement de Langue

La plateforme est disponible en **français** et en **anglais**. Pour changer de langue :

1. Dans la barre supérieure (topbar), cliquez sur le bouton **EN** ou **FR** selon la langue souhaitée.
2. La langue change immédiatement sur la page en cours.

### Déconnexion

Pour vous déconnecter de manière sécurisée :

1. Cliquez sur le bouton **« Se déconnecter »** dans la barre supérieure (haut à droite).
2. Vous serez redirigé vers la page de connexion.

> ⚠️ **Sécurité :** Déconnectez-vous toujours de la plateforme avant de quitter votre poste, en particulier sur un ordinateur partagé. Ne laissez jamais une session ouverte sans surveillance.

### Recommandations de Sécurité

- Utilisez un mot de passe d'au moins **12 caractères**, combinant majuscules, minuscules, chiffres et symboles.
- Ne partagez jamais vos identifiants avec un collègue.
- Changez votre mot de passe tous les **3 mois**.
- En cas de suspicion de compromission, contactez immédiatement votre administrateur.

---

## 4. Vue d'Ensemble du Tableau de Bord

Après connexion, le tableau de bord principal vous présente un aperçu global de l'activité de votre service.

### Navigation Principale

La barre de navigation gauche (sidebar) donne accès aux sections suivantes :

| Section | Description |
|---|---|
| 🏠 **Tableau de bord** | Vue synthétique : statistiques clés, examens récents, comptes rendus récents |
| 👤 **Patients** | Gestion du répertoire complet des patients |
| 🩻 **Examens** | Liste et suivi de tous les examens d'imagerie |
| 📄 **Comptes rendus** | Accès à tous les comptes rendus (brouillons, finalisés, amendés) |
| 📋 **Modèles** | Bibliothèque de modèles de comptes rendus réutilisables |
| 📊 **Analytique** | Indicateurs de performance et statistiques du service |
| 🚨 **File Critique** | Liste des examens nécessitant une attention urgente |
| 🔍 **Historique des Audits** | Journal complet de toutes les actions effectuées |
| ⚙️ **Paramètres** | Configuration du compte et préférences |

### Indicateurs Clés (Tableau de Bord)

Le tableau de bord affiche quatre indicateurs principaux :

| Indicateur | Description |
|---|---|
| **Patients Actifs** | Nombre total de patients enregistrés dans le système |
| **Examens en Attente** | Examens reçus non encore traités |
| **Brouillons** | Comptes rendus sauvegardés mais non finalisés |
| **Rapports Finalisés** | Comptes rendus définitivement signés et archivés |

> 💡 **Conseil :** Consultez le tableau de bord chaque matin pour identifier rapidement les examens urgents et les comptes rendus en attente de finalisation.

---

## 5. Gestion des Patients

### Accéder à la Liste des Patients

1. Cliquez sur **« Patients »** dans la barre de navigation gauche.
2. La liste affiche tous les patients enregistrés, avec leur statut (Actif, Inactif, Décédé).

### Rechercher un Patient

1. Dans le champ de recherche, saisissez le nom, prénom ou numéro de dossier (MRN) du patient.
2. Cliquez sur **« Rechercher »** ou appuyez sur Entrée.
3. Utilisez les filtres de statut pour affiner les résultats.

### Créer un Nouveau Patient

1. Cliquez sur le bouton **« + Nouveau Patient »** (en haut à droite de la liste).
2. Remplissez le formulaire :

| Champ | Obligatoire | Description |
|---|---|---|
| Prénom | ✅ Oui | Prénom du patient |
| Nom | ✅ Oui | Nom de famille du patient |
| Date de naissance | ✅ Oui | Format : JJ/MM/AAAA |
| Sexe | ✅ Oui | Masculin / Féminin / Autre |
| Numéro de dossier (MRN) | ✅ Oui | Identifiant unique dans votre établissement |
| Téléphone | Non | Numéro de contact |
| Statut | ✅ Oui | Actif / Inactif / Décédé |

3. Cliquez sur **« Enregistrer »** pour créer le dossier patient.

> ℹ️ **Information :** Le numéro de dossier (MRN) doit être unique. Si un doublon est détecté, le système vous en informera.

### Modifier un Dossier Patient

1. Cliquez sur le nom du patient dans la liste pour ouvrir son profil.
2. Cliquez sur **« Modifier »**.
3. Apportez vos modifications.
4. Cliquez sur **« Enregistrer »**.

### Consulter le Profil d'un Patient

Le profil patient affiche :
- Les informations personnelles et administratives
- L'historique complet des examens associés
- Les comptes rendus produits

### Ajouter un Examen à un Patient

1. Ouvrez le profil du patient.
2. Cliquez sur **« Nouvel Examen »**.
3. Renseignez les informations de l'examen (voir section suivante).

---

## 6. Flux de Travail des Examens

### Créer un Examen

1. Accédez à la section **« Examens »** ou depuis le profil patient.
2. Cliquez sur **« Nouvel Examen »**.
3. Remplissez le formulaire :

| Champ | Description |
|---|---|
| **Patient** | Sélectionner le patient associé |
| **Numéro d'accession** | Identifiant de l'examen (automatique ou manuel) |
| **Modalité** | Type d'imagerie : RX, TDM, IRM, Écho, etc. |
| **Partie du corps** | Zone anatomique étudiée |
| **Date de l'examen** | Date de réalisation |
| **Priorité** | Routine / Urgent / STAT |
| **Notes cliniques** | Indication clinique et informations pertinentes |

4. Cliquez sur **« Créer l'Examen »**.

### Progression des Statuts

Chaque examen suit une progression de statuts :

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   EN ATTENTE │ →  │ EN COURS DE │ →  │   RAPPORTÉ  │ →  │  VALIDÉ     │    │  ANNULÉ     │
│  (Pending)   │    │  LECTURE    │    │  (Reported) │    │ (Validated) │    │ (Cancelled) │
│              │    │ (In Review) │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

| Statut | Description |
|---|---|
| **En Attente** | Examen enregistré, en attente de lecture |
| **En Cours de Lecture** | Le radiologue a commencé l'interprétation |
| **Rapporté** | Le compte rendu a été rédigé et sauvegardé |
| **Validé** | Le compte rendu a été finalisé et signé |
| **Annulé** | Examen annulé (avec justification) |

### Indicateurs SLA

Les examens affichent un indicateur de respect des délais (SLA) :

| Indicateur | Signification |
|---|---|
| 🟢 Vert | Dans les délais |
| 🟡 Jaune | Délai approchant |
| 🔴 Rouge | Délai dépassé |

### Signalement d'Examens Critiques

Un examen peut être marqué comme **critique** lorsque les résultats nécessitent une communication urgente au clinicien référent. Ces examens apparaissent dans la **File Critique** et sont signalés par une alerte visuelle.

> ⚠️ **Attention :** Les examens marqués comme critiques doivent être traités en priorité absolue. Vérifiez la File Critique au début et à la fin de chaque session de travail.

---

## 7. Flux de Travail des Comptes Rendus

### Créer un Compte Rendu

Un compte rendu est automatiquement créé lorsqu'un radiologue commence la rédaction sur un examen. Vous pouvez également créer un compte rendu manuellement :

1. Ouvrez l'examen concerné.
2. Cliquez sur **« Créer un Compte Rendu »**.
3. L'éditeur de compte rendu s'ouvre.

### Flux de Travail Complet

```
  Examen reçu
       │
       ▼
  Ouverture de l'éditeur
       │
       ▼
  Rédaction (dictée vocale / saisie manuelle / structuration IA)
       │
       ▼
  ┌─────────────────┐
  │  SAUVEGARDE     │ ← Sauvegardez régulièrement pendant la rédaction
  │  BROUILLON      │
  └─────────────────┘
       │
       ▼
  Relecture et vérification
       │
       ▼
  ┌─────────────────┐
  │  FINALISATION   │ ← Action irréversible — le rapport est signé
  └─────────────────┘
       │
       ▼
  Distribution / Archivage
       │
       ▼ (si nécessaire)
  ┌─────────────────┐
  │  AMENDEMENT     │ ← Crée une nouvelle version, conserve l'historique
  └─────────────────┘
```

### Sauvegarder un Brouillon

1. Pendant la rédaction, cliquez sur **« Sauvegarder »** à tout moment.
2. Le compte rendu est sauvegardé avec le statut **Brouillon**.
3. Vous pouvez reprendre la rédaction ultérieurement.

> 💡 **Conseil :** Sauvegardez votre travail toutes les 5 minutes. La plateforme ne sauvegarde pas automatiquement en continu.

### Finaliser un Compte Rendu

> ⚠️ **ATTENTION : Action irréversible.** Une fois finalisé, un compte rendu ne peut plus être modifié directement. Il peut uniquement être **amendé** (voir ci-dessous).

1. Relisez l'intégralité du compte rendu.
2. Vérifiez que toutes les informations cliniques sont exactes et complètes.
3. Cliquez sur **« Finaliser »**.
4. Confirmez la finalisation dans la fenêtre de dialogue.
5. Le statut passe à **Finalisé**. Le compte rendu est signé et horodaté.

### Amender un Compte Rendu

Si une correction est nécessaire après finalisation :

1. Ouvrez le compte rendu finalisé.
2. Cliquez sur **« Amender »**.
3. Une nouvelle version du compte rendu est créée.
4. Apportez vos corrections.
5. Finalisez la version amendée.

> ℹ️ **Information :** L'amendement crée une **nouvelle version** tout en conservant l'historique complet des versions précédentes. Toutes les versions restent accessibles et auditables.

### Historique des Versions

Chaque compte rendu conserve un historique complet de ses versions :

1. Ouvrez le compte rendu.
2. Cliquez sur **« Historique des Versions »**.
3. Vous pouvez consulter chaque version antérieure avec sa date, son heure et l'auteur.

---

## 8. Fonctionnalités IA — Vue d'Ensemble

Radiora Medical intègre plusieurs outils d'intelligence artificielle pour assister le radiologue dans son travail quotidien. Ces outils sont **facultatifs** et toujours sous contrôle du clinicien.

> ⚠️ **RAPPEL ESSENTIEL :** Toute suggestion générée par l'intelligence artificielle doit être **lue, vérifiée et validée** par un professionnel de santé habilité. L'IA est un outil d'assistance — elle ne remplace pas l'expertise médicale.

### Récapitulatif des Fonctionnalités IA

| Fonctionnalité | Description | Où y accéder |
|---|---|---|
| **Structuration Intelligente** | Propose une structure organisée pour le compte rendu | Éditeur de compte rendu |
| **Dictée Vocale** | Transcription de la parole en texte | Éditeur de compte rendu |
| **Explication Patient** | Génère une version simplifiée du rapport pour le patient | Éditeur de compte rendu |
| **Traduction** | Traduit le compte rendu (FR ↔ EN) | Éditeur de compte rendu |
| **Résultats IA Externes** | Importe et intègre des analyses d'IA externe | Page de l'examen |

### 8.1 Structuration Intelligente

La structuration intelligente propose un plan organisé pour votre compte rendu, basé sur la modalité et la région anatomique.

**Comment l'utiliser :**
1. Dans l'éditeur de compte rendu, cliquez sur **« Structuration Intelligente »**.
2. L'outil génère une structure avec les sections standard (Indication, Technique, Résultats, Conclusion).
3. Complétez chaque section avec votre interprétation.
4. Modifiez librement la structure proposée si nécessaire.

### 8.2 Dictée Vocale

La dictée vocale vous permet de rédiger votre compte rendu par la parole, convertie automatiquement en texte.

**Prérequis :** Microphone fonctionnel et autorisation accordée au navigateur.

**Comment l'utiliser :**
1. Dans l'éditeur, cliquez sur l'icône **microphone** (🎤).
2. Autorisez l'accès au microphone si demandé par le navigateur.
3. Parlez clairement et à un rythme normal.
4. Le texte apparaît en temps réel dans l'éditeur.
5. Cliquez à nouveau sur l'icône pour arrêter l'enregistrement.
6. Relisez et corrigez le texte transcrit avant de sauvegarder.

> 💡 **Conseil :** Dictez dans un environnement calme. Relisez toujours la transcription — des erreurs de vocabulaire médical peuvent survenir.

### 8.3 Explication Patient

Cette fonctionnalité génère automatiquement une version simplifiée du compte rendu, adaptée à la compréhension d'un patient non médecin.

**Comment l'utiliser :**
1. Après avoir rédigé votre compte rendu, cliquez sur **« Explication Patient »**.
2. L'outil génère un texte en langage accessible.
3. Relisez et ajustez le contenu si nécessaire.
4. Cette explication peut être imprimée ou partagée avec le patient.

> ⚠️ **Attention :** Vérifiez que l'explication patient ne contient aucune information incorrecte ou susceptible d'inquiéter inutilement le patient avant de la partager.

### 8.4 Traduction

La fonctionnalité de traduction permet de basculer le compte rendu entre le français et l'anglais.

**Comment l'utiliser :**
1. Dans l'éditeur de compte rendu, cliquez sur **« Traduction »**.
2. Sélectionnez la langue cible.
3. L'outil génère une traduction automatique.
4. Vérifiez la traduction — certains termes médicaux spécifiques peuvent nécessiter une correction.

### 8.5 Résultats IA Externes

Voir la section suivante (Section 9).

---

## 9. Résultats IA Externes

Certains établissements utilisent des logiciels d'IA externe (détection de nodules, triage automatique, etc.). Radiora Medical permet d'importer ces résultats et de les intégrer au compte rendu.

> ⚠️ **IMPORTANT :** Les résultats générés par des IA externes ne constituent pas un diagnostic. Ils doivent impérativement être examinés et validés par le radiologue avant toute intégration au compte rendu.

### Importer des Résultats IA Externes

1. Ouvrez l'examen concerné.
2. Accédez à l'onglet **« IA Externe »**.
3. Saisissez ou collez les résultats de l'IA externe dans le champ prévu.
4. Cliquez sur **« Importer »**.

### Examiner les Résultats

Les résultats importés sont affichés sous forme de fiches individuelles. Pour chaque finding :

| Action | Description |
|---|---|
| ✅ **Accepter** | Le finding est jugé correct et pertinent par le radiologue |
| ❌ **Rejeter** | Le finding est incorrect ou non pertinent |

### Appliquer les Findings Acceptés au Compte Rendu

1. Après avoir accepté les findings pertinents, cliquez sur **« Appliquer au Compte Rendu »**.
2. Les findings acceptés sont automatiquement insérés dans le brouillon du compte rendu.
3. Relisez et intégrez ces éléments dans votre rédaction finale.

> 💡 **Conseil :** N'acceptez jamais un finding sans l'avoir vérifié sur les images. L'IA peut générer des faux positifs ou des interprétations incorrectes.

---

## 10. Audit et Traçabilité

### Tout Est Enregistré

Radiora Medical enregistre automatiquement **toutes les actions** effectuées sur la plateforme :

- Connexions et déconnexions
- Créations, modifications et suppressions de patients
- Créations, modifications de statuts des examens
- Rédactions, sauvegardes, finalisations et amendements de comptes rendus
- Utilisation des fonctionnalités IA
- Importation de résultats IA externes
- Actions administratives

### Accéder à l'Historique des Audits

1. Cliquez sur **« Historique des Audits »** dans la navigation gauche.
2. Le journal affiche toutes les actions avec :
   - Date et heure précises
   - Utilisateur ayant effectué l'action
   - Type d'action
   - Ressource concernée

> ℹ️ **Information :** L'accès à l'historique des audits est réservé aux administrateurs de clinique et aux super-administrateurs. Les radiologues ont accès à leur propre historique d'actions.

### Historique des Versions des Comptes Rendus

Chaque version d'un compte rendu est conservée indéfiniment :

- Version initiale (brouillon)
- Chaque sauvegarde intermédiaire
- Version finalisée
- Versions amendées

Cette traçabilité garantit la **responsabilité médicale** et la **conformité réglementaire**.

---

## 11. Sécurité et Confidentialité

### Architecture Multi-Établissements

Radiora Medical est une plateforme **multi-établissements** (multi-tenant) :

- Chaque clinique dispose de son propre espace **complètement isolé**.
- Les données d'un établissement ne sont **jamais accessibles** à un autre établissement.
- Les administrateurs d'une clinique ne voient que les données de leur propre clinique.

### Rôles et Permissions

| Rôle | Accès |
|---|---|
| **Super Administrateur** | Accès complet à tous les établissements (équipe Radiora uniquement) |
| **Administrateur de Clinique** | Gestion complète de son établissement |
| **Radiologue** | Gestion des examens et comptes rendus de son établissement |
| **Technicien** | Gestion des examens, accès limité aux comptes rendus |
| **Médecin Référent** | Consultation des comptes rendus de ses patients |

### Recommandations de Sécurité

| Pratique | Description |
|---|---|
| **Mot de passe fort** | Minimum 12 caractères, combinaison de lettres, chiffres et symboles |
| **Pas de partage** | Ne communiquez jamais vos identifiants à quiconque |
| **Déconnexion systématique** | Déconnectez-vous avant de quitter votre poste |
| **Réseau sécurisé** | Utilisez uniquement le réseau de votre établissement ou une connexion sécurisée |
| **Écran verrouillé** | Verrouillez votre écran si vous quittez brièvement votre poste |

### Confidentialité des Données Patients

Toutes les données patients sont :
- Chiffrées en transit (HTTPS/TLS)
- Chiffrées au repos dans la base de données
- Accessibles uniquement au personnel autorisé de l'établissement concerné
- Soumises aux obligations de confidentialité médicale applicables

> ⚠️ **Rappel Légal :** Les données de santé des patients sont des données sensibles protégées par la loi. Tout accès non autorisé constitue une faute professionnelle grave. Radiora Medical journalise toutes les consultations de données.

---

## 12. Résolution de Problèmes

### Problème : Le Microphone ne Fonctionne Pas

| Cause Possible | Solution |
|---|---|
| Accès non autorisé dans le navigateur | Cliquez sur l'icône cadenas dans la barre d'adresse → Autoriser le microphone |
| Microphone non détecté | Vérifiez la connexion physique du microphone, redémarrez le navigateur |
| Microphone utilisé par une autre application | Fermez toutes les autres applications utilisant le microphone |
| Navigateur non compatible | Basculez vers Google Chrome |

**Étapes de vérification :**
1. Testez votre microphone dans un autre outil (ex. enregistreur audio du système).
2. Dans Chrome : Menu → Paramètres → Confidentialité → Microphone → Autoriser le site.
3. Rechargez la page et réessayez.

---

### Problème : Impossible de Se Connecter

| Cause Possible | Solution |
|---|---|
| Identifiants incorrects | Vérifiez l'adresse e-mail et le mot de passe |
| Compte désactivé | Contactez votre administrateur de clinique |
| Mot de passe oublié | Cliquez sur « Mot de passe oublié » sur la page de connexion |
| Navigateur incompatible | Utilisez Chrome ou Firefox à jour |

---

### Problème : Session Expirée

**Symptôme :** Vous êtes redirigé vers la page de connexion sans avoir cliqué sur « Se déconnecter ».

**Cause :** Les sessions expirent après une période d'inactivité pour des raisons de sécurité.

**Solution :**
1. Reconnectez-vous avec vos identifiants.
2. Vos données sauvegardées sont intactes.

> 💡 **Conseil :** Sauvegardez régulièrement votre travail pour éviter toute perte en cas d'expiration de session.

---

### Problème : Page ne se Charge Pas / Erreur 404

| Cause Possible | Solution |
|---|---|
| Connexion internet instable | Vérifiez votre connexion, actualisez la page (F5) |
| URL incorrecte | Retournez à l'accueil et naviguez depuis le menu |
| Erreur temporaire du serveur | Patientez 2 minutes et réessayez |

---

### Problème : Navigateur Non Supporté

**Symptôme :** La page s'affiche incorrectement ou certaines fonctionnalités ne répondent pas.

**Solution :** Téléchargez et installez **Google Chrome** (version récente) depuis le site officiel.

---

### Problème : Données Patient Introuvables

| Cause Possible | Solution |
|---|---|
| Recherche incorrecte | Vérifiez l'orthographe du nom ou le numéro de dossier |
| Patient créé dans un autre établissement | Les données sont cloisonnées par établissement |
| Patient non encore enregistré | Créez un nouveau dossier patient |

---

## 13. Retours Pilote

Votre participation active à la phase pilote est **précieuse et essentielle** pour améliorer Radiora Medical.

### Ce que nous vous demandons de signaler

| Type de Retour | Exemples |
|---|---|
| **Bugs** | Fonctionnalité qui ne répond pas, erreur affichée, données incorrectes |
| **Ergonomie (UX)** | Étape difficile à trouver, bouton mal placé, interface peu claire |
| **Flux de travail** | Étapes manquantes, ordre illogique, trop de clics pour une action simple |
| **Fonctionnalités manquantes** | Besoin identifié non couvert par la plateforme actuelle |
| **Suggestions** | Toute idée d'amélioration, même mineure |
| **Retours positifs** | Ce qui fonctionne bien — nous voulons le conserver ! |

### Comment Signaler un Problème

1. Notez l'action que vous étiez en train d'effectuer.
2. Notez le message d'erreur exact (si applicable).
3. Si possible, faites une capture d'écran.
4. Transmettez ces informations à l'équipe Radiora via les contacts en Section 15.

> ℹ️ **Information :** Aucun retour n'est trop petit ou trop insignifiant. Les meilleures améliorations viennent souvent des observations du quotidien.

---

## 14. Démarrage Rapide

Guide condensé pour commencer à utiliser Radiora Medical immédiatement.

### Première Session — Checklist

- [ ] Accéder à la plateforme avec vos identifiants
- [ ] Vérifier votre nom et rôle en haut à droite
- [ ] Explorer le tableau de bord et les statistiques
- [ ] Créer un premier patient test (si autorisé)
- [ ] Créer un premier examen test
- [ ] Ouvrir l'éditeur de compte rendu
- [ ] Tester la dictée vocale
- [ ] Sauvegarder un brouillon
- [ ] Se déconnecter correctement

### Flux Quotidien Type (Radiologue)

```
Connexion
    │
    ▼
Tableau de Bord
— Vérifier les examens urgents (File Critique)
— Vérifier les brouillons en attente
    │
    ▼
File Critique (si applicable)
— Traiter en priorité
    │
    ▼
Examens en Attente
— Ouvrir le premier examen
— Rédiger le compte rendu (dictée ou saisie)
— Utiliser la structuration IA si utile
— Sauvegarder en brouillon
— Relire et finaliser
    │
    ▼
Répéter pour chaque examen
    │
    ▼
Déconnexion sécurisée
```

### Raccourcis Utiles

| Action | Comment faire |
|---|---|
| Sauvegarder un brouillon | Bouton « Sauvegarder » dans l'éditeur |
| Changer de langue | Bouton FR/EN dans la topbar |
| Rechercher un patient | Barre de recherche dans la page Patients |
| Voir les examens urgents | Section « File Critique » dans le menu |
| Se déconnecter | Bouton « Se déconnecter » en haut à droite |

---

## 15. Contacts et Support

### Contact Support Pilote

| Canal | Informations |
|---|---|
| **E-mail Support** | support@radiora.medical *(à confirmer)* |
| **WhatsApp** | *(numéro à communiquer par l'équipe)* |
| **Référent Pilote** | *(nom et contact de votre référent Radiora)* |

### Horaires de Support

| Période | Disponibilité |
|---|---|
| **Jours ouvrables** | Lundi — Vendredi, 8h00 — 18h00 (GMT) |
| **Urgences techniques** | Via WhatsApp uniquement |
| **Hors horaires** | Envoyez un e-mail, réponse le prochain jour ouvrable |

### Avant de Contacter le Support

Pour accélérer la résolution de votre problème, préparez les informations suivantes :

1. Votre nom et établissement
2. La fonctionnalité concernée
3. Les étapes qui ont précédé le problème
4. Un message d'erreur ou une capture d'écran (si disponible)
5. Le navigateur et la version utilisés

---

## Annexe — Glossaire

| Terme | Définition |
|---|---|
| **Brouillon** | Compte rendu sauvegardé mais non encore finalisé |
| **Finalisé** | Compte rendu signé définitivement, non modifiable directement |
| **Amendé** | Nouvelle version créée après finalisation pour corriger le compte rendu |
| **MRN** | Medical Record Number — numéro d'identification unique du patient |
| **Modalité** | Type d'imagerie médicale (RX, TDM, IRM, Écho, TEP-scan…) |
| **SLA** | Service Level Agreement — délai contractuel de rendu des résultats |
| **File Critique** | Liste des examens nécessitant une réponse urgente |
| **Audit** | Journal traçant toutes les actions effectuées sur la plateforme |
| **Multi-tenant** | Architecture où chaque établissement a ses données isolées des autres |
| **IA** | Intelligence Artificielle — outil d'assistance, jamais de décision autonome |
| **STAT** | Priorité maximale — examen devant être traité immédiatement |

---

*Radiora Medical — Plateforme intelligente de gestion des comptes rendus radiologiques*
*Conçu pour les cliniques et centres d'imagerie en Afrique francophone.*

*Version 1.0 — Phase Pilote — Mai 2026*
*Document Confidentiel — Usage Pilote Uniquement*

---
