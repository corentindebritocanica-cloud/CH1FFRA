<img src="assets/logo.svg" alt="CH1FFRA" width="260" />

# PLAN COMPLET — Ch1ffra, outil d'aide au chiffrage pour petites structures mécaniques

*Nom retenu : **CH1FFRA** — slug GitHub : `ch1ffra`*

---

## 0. ÉTAT D'AVANCEMENT ACTUEL

- **Validation terrain (section 6, étape 1)** : pas encore faite — développement lancé en parallèle.
- **Squelette du projet créé** : `index.html`, `css/style.css`, `js/calcul.js`, `js/storage.js`, `js/app.js`.
- **Identité visuelle définie** (thème sombre inspiré de https://bitnomial.com/, adapté à un outil de saisie quotidien) :
  - Logo vectorisé (`assets/logo.svg`, `assets/logo-dark-bg.svg`) à partir du wordmark fourni par l'utilisateur — "CH1FFRA" en majuscules, C/H/1 en contour, FFRA plein
  - Fond sombre sur toute l'app (`#0a0c10`), avec un fond animé fluide en arrière-plan : trois masses colorées floutées (bleu, sarcelle, violet) qui dérivent lentement en boucle, façon aurore — désactivé si `prefers-reduced-motion`
  - En-tête et pied de page légèrement plus clairs (`#14171c`) avec un filet de séparation, pour structurer sans casser l'unité sombre
  - Typo : Space Grotesk pour les titres, Inter pour le texte courant, IBM Plex Mono pour les désignations matière, quantités et prix
  - Accent unique bleu vif (`#2f6fed`), réservé aux états actifs — la carte "prix total" et le bouton "Calculer" ont une légère lueur (box-shadow) dans cette couleur
  - Sections séparées par des filets fins façon fiche technique, plutôt que des cartes à ombre/coins arrondis
  - Animation : le logo apparaît en un fondu au chargement ; le prix total du devis s'anime en comptant jusqu'au résultat au clic sur "Calculer" (repli statique respecté si `prefers-reduced-motion`)
  - *Historique des directions explorées : d'abord un thème clair "papier technique" (fond `#eef1f4`, bandeau sombre), inspiré de https://www.fabianfallend.com/ — abandonné au profit du thème sombre complet actuel, plus proche du retour utilisateur*
- Fonctionnel pour l'instant :
  - Formulaire de devis (matière, épaisseur, quantité, opération, temps/taux/prix matière/marge)
  - **Page dédiée "Matières"** : bibliothèque modifiable (ajout, édition, suppression de matières et de catégories entières), avec désignations normalisées (aciers, aciers inox ex. X2CrNiMo17-12-2 / 316L, fontes, aluminiums, plastiques techniques PTFE/POM/PE/PA6-66/PEEK/PMMA/PC/PVC), densité et prix indicatif au kg éditables pour chaque matière — toute modification se répercute immédiatement dans le menu déroulant du formulaire de devis
  - Prix indicatifs au kg pré-remplis à partir d'une estimation de marché 2026 (à ajuster selon les fournisseurs réels de l'atelier — les cours des métaux et plastiques varient constamment)
  - Calcul du prix estimé (formule simple : temps × taux horaire + poids × prix matière, puis marge)
  - Sauvegarde du devis dans un historique local (`localStorage`, pas encore Firebase — cohérent avec la section 5bis)
  - **Écran d'accueil** au démarrage : deux choix, "Nouveau devis" ou "Devis existant" (renvoie vers le formulaire ou l'historique)
  - **Page "Clients"** : liste modifiable (nom, email, téléphone, adresse, notes). Un client saisi dans un devis et qui n'existe pas encore est **créé automatiquement** (fiche minimale, à compléter plus tard) — pas de double saisie. Le champ "Client" du formulaire de devis propose ces clients en autocomplétion (`<datalist>`), avec un lien direct vers la page de gestion
  - **Historique** : suppression possible d'un devis (bouton ✕ par ligne, confirmation demandée)
  - **Navigation simplifiée** : seuls "Accueil" et "Paramètres" sont des onglets. Paramètres est organisé en deux sections — "Données" (Historique / Clients / Matières, en cartes) et "Préférences" (valeurs par défaut, à venir). Chaque page secondaire a un lien "← Accueil" pour revenir
- Note technique : la bibliothèque de matières est structurée par catégorie → liste de `{code, nom, densite, prixKg}`, stockée en `localStorage` sous forme d'un objet modifiable. Cette structure est pensée pour se transposer facilement plus tard dans une collection Firestore `materiaux` (un document par matière, un champ catégorie), afin d'avoir la bibliothèque en ligne et partagée entre les appareils de l'utilisateur une fois Firebase branché. Les clients suivent la même logique : liste plate de `{id, nom, email, telephone, adresse, notes}`, prête à devenir une collection Firestore `clients`.
- Pas encore fait :
  - Export PDF réel (bouton présent, jsPDF pas encore branché)
  - Vue "Paramètres" (taux horaire/prix matière par défaut)
  - Parsing STEP et OCR (prévus en V2, section 5bis)
  - Firebase (auth, Firestore, Storage)

---

## 1. À QUOI SERT L'APP (en une phrase)

Un outil web simple où un atelier ou un bureau d'études upload un plan (PDF/image) ou un fichier 3D (STEP), et l'outil aide à préparer un pré-devis plus vite en extrayant automatiquement les infos utiles (dimensions, matière, quantité de perçages, tolérances) et en proposant une estimation de temps/coût que l'utilisateur ajuste et valide.

**Ce n'est PAS un chiffrage 100% automatique.** L'humain garde toujours la main : l'outil accélère et structure le travail, il ne remplace pas le chiffreur.

---

## 2. LE PROBLÈME QUE ÇA RÉSOUT

- Dans les petites structures mécaniques (TPE/PME, 1 à 15 personnes), le chiffrage d'un devis prend du temps : il faut relire le plan, estimer les temps d'usinage/pliage/soudure, chercher les prix matière, et tout ça repose souvent sur une seule personne expérimentée.
- Beaucoup de devis sont mal chiffrés (trop bas → perte d'argent, trop haut → client perdu) faute de temps pour bien analyser chaque plan.
- Les outils qui existent déjà (Relief, CloudNC, DigiFabster...) sont soit très chers, soit en anglais, soit pensés pour les gros usineurs — pas pour une petite structure française.

**Cible** : petites structures françaises de mécanique générale, tôlerie, usinage, chaudronnerie (1 à 20 salariés), qui n'ont pas les moyens ou le besoin d'un logiciel de chiffrage industriel à 500€/mois.

---

## 3. FONCTIONNALITÉS

### Version 1 — MVP (ce qu'on construit en premier, le plus simple possible)
- Upload d'un fichier (photo de plan, PDF, ou fichier STEP)
- Formulaire simple à côté : matière, quantité de pièces, épaisseur, type d'opération (usinage / tôlerie / soudure)
- L'outil aide à calculer une estimation de base (temps + prix matière + marge) selon des règles simples que l'utilisateur peut ajuster (ex : prix horaire de la machine, prix au kilo de la matière)
- Génération d'un pré-devis simple (PDF ou texte à copier) avec le détail du calcul
- Sauvegarde des devis faits (historique, pour réutiliser une base similaire plus tard)

### Version 2 — une fois que la V1 est utilisée et validée par de vrais clients
- Lecture automatique de dimensions/poids à partir d'un fichier STEP (parsing géométrique, voir section 5bis)
- Lecture du texte du cartouche sur une photo/PDF de plan papier (OCR, voir section 5bis)
- Bibliothèque de prix matière mise à jour (acier, alu, inox...)
- Détection de points d'attention sur le plan (tolérance très serrée, paroi fine) pour alerter avant fabrication
- Export propre du devis en PDF avec logo de l'entreprise cliente

### Version 3 — plus tard, si ça marche bien
- Historique et statistiques (quels types de pièces rapportent le plus, temps moyen par type d'opération)
- Multi-utilisateurs pour une équipe (plusieurs personnes de l'atelier)
- Connexion avec un logiciel de facturation existant

**Règle d'or : ne pas construire la V2 et V3 tant que la V1 n'a pas au moins 1 vrai client qui l'utilise régulièrement.**

---

## 4. PARCOURS UTILISATEUR (comment ça se passe pour la personne qui utilise l'app)

1. Elle se connecte à l'app (compte simple, email + mot de passe)
2. Elle clique sur "Nouveau devis"
3. Elle upload le plan ou la photo de la pièce
4. Elle remplit les quelques champs demandés (matière, quantité, type d'opération)
5. L'app calcule une proposition de temps et de prix
6. Elle ajuste les chiffres si besoin (elle garde toujours le contrôle)
7. Elle valide → un devis propre est généré, prêt à envoyer au client
8. Le devis est sauvegardé dans son historique

---

## 5. BESOINS TECHNIQUES (architecture recommandée)

Cette section décrit ce qu'il faudra construire, dans la continuité de ce que Corentin sait déjà faire (outils HTML/JS avec Firebase, comme ses autres projets Caliper Pro, Budget L&C, Duo Training).

### Stack technique recommandé
- **Front-end** : une seule page HTML/CSS/JavaScript, pas de framework complexe nécessaire au début
- **Stockage des données** : Firebase (Firestore pour les données des devis, Firebase Storage pour les fichiers uploadés — plans/PDF/STEP) — **non nécessaire au démarrage du développement**, voir section 5bis
- **Authentification** : Firebase Authentication (email/mot de passe) — idem, à brancher plus tard
- **Hébergement** : GitHub Pages (gratuit) ou Firebase Hosting
- **Génération de PDF** : une bibliothèque JavaScript légère (ex : jsPDF) pour sortir le devis en PDF directement depuis le navigateur, sans serveur

### Ce qui est simple à faire dès le départ
- Formulaire de saisie
- Calcul de prix selon une formule simple (temps estimé × taux horaire + prix matière × poids/quantité + marge)
- Export PDF

### Structure de données simple (Firestore, à brancher plus tard)
- Collection `devis` : un document par devis avec les champs (client, date, matière, quantité, opérations, temps estimé, prix, fichier attaché, statut)
- Collection `utilisateurs` : infos de compte (nom entreprise, taux horaire par défaut, prix matière par défaut)
- Collection `parametres` : les taux horaires et prix matière que chaque utilisateur peut personnaliser

### Sécurité et confidentialité
- Chaque entreprise ne doit voir que ses propres devis (règles de sécurité Firestore par utilisateur, une fois Firebase branché)
- Les plans clients sont sensibles → bien vérifier que les fichiers uploadés ne sont accessibles qu'au propriétaire du compte

---

## 5bis. EXTRACTION AUTOMATIQUE DE DONNÉES (STEP et photo/PDF) — décisions actées

**Contrainte posée par Corentin : aucune IA externe, aucun service tiers, aucun serveur avec coût récurrent. Tout doit tourner en local, dans le navigateur.** Raison : confidentialité des plans clients (rien ne doit sortir de la machine) + volonté de ne dépendre d'aucun abonnement/service tiers.

Conséquence : Firebase (Cloud Functions/Cloud Run) est écarté pour cette fonctionnalité — un modèle de vision nécessite du GPU, que Firebase ne fournit pas gratuitement, et l'ajout d'un serveur GPU dédié introduirait justement le coût et la dépendance qu'on veut éviter.

### Fichier STEP (3D) → parsing géométrique local
- Bibliothèque WASM (ex : `occt-import-js` / OpenCascade.js) chargée directement dans le navigateur, aucun serveur
- Permet d'extraire : bounding box, dimensions hors-tout, volume approximatif → poids matière, à partir de la géométrie exacte du fichier
- Fiable et déterministe, car basé sur de la vraie géométrie et non une image

### Photo / PDF de plan papier → OCR local uniquement
- Bibliothèque OCR 100% navigateur (ex : `Tesseract.js`), aucun appel réseau, aucun coût
- Lit uniquement le **texte imprimé** : cartouche, référence pièce, matière écrite, tolérances écrites en toutes lettres
- Ne lit **pas** les cotes graphiques (lignes de cote, flèches, chiffres positionnés sur le dessin) — cette limitation est assumée : lire une cote graphique sans IA externe n'est pas réalisable de façon fiable aujourd'hui
- Les champs remplis via OCR restent toujours à vérifier/corriger par l'utilisateur avant validation (cohérent avec la philosophie "assistant, pas remplaçant")
- Option explorée puis écartée pour l'instant : petit modèle de vision embarqué tournant dans le navigateur via WebGPU (zéro serveur, zéro coût) — techniquement possible mais encore peu fiable sur des plans techniques et dépendant du GPU du poste client ; à réévaluer plus tard, une fois l'app utilisée par de vrais clients

### Ordre de développement de cette brique
1. Développer et tester le parsing STEP et l'OCR **sans Firebase**, dans une page HTML statique autonome (upload → extraction → affichage des résultats)
2. Brancher Firebase (auth, Firestore, Storage) seulement une fois ces deux briques fonctionnelles, pour la sauvegarde des devis et la gestion multi-comptes

---

## 6. PLAN DE DÉVELOPPEMENT ÉTAPE PAR ÉTAPE

1. **Ne rien coder tout de suite.** Aller parler à 5-10 personnes dans des ateliers/PME mécaniques (réseau professionnel de Corentin) pour vérifier que le chiffrage est bien un problème pour elles et qu'elles seraient prêtes à payer un abonnement simple (30-50€/mois) pour un outil qui les aide.
2. Si le retour est positif : construire la V1 (formulaire + calcul + PDF), sans la partie extraction automatique, en 2-4 semaines.
3. Faire tester la V1 à 2-3 vrais ateliers gratuitement pendant 1 mois, récolter les retours.
4. Ajuster selon les retours, puis proposer un premier abonnement payant.
5. Une fois 1 à 3 clients payants : ajouter le parsing STEP et l'OCR (V2), en développant et testant ces briques sans Firebase avant de les intégrer.

---

## 7. MODÈLE ÉCONOMIQUE

- Abonnement mensuel simple, par exemple 29 à 49€/mois par entreprise
- Pas besoin de lever des fonds : coût de développement quasi nul (Corentin code lui-même), coût d'hébergement Firebase très faible au démarrage, et aucune dépendance à un service IA payant grâce au choix du 100% local
- Objectif réaliste au départ : quelques clients payants pour valider, pas une recherche de croissance rapide

---

## 8. POINTS DE VIGILANCE

- Le calcul du temps d'usinage/pliage est difficile à automatiser correctement — d'où l'importance de laisser l'humain ajuster les chiffres proposés plutôt que de vouloir un calcul 100% automatique dès le départ
- Bien insister sur le fait que l'outil est un **assistant**, pas un remplaçant du chiffreur, pour rassurer les utilisateurs
- Vérifier la confidentialité des plans clients uploadés (données sensibles) — renforcé par le choix du 100% local pour l'extraction (STEP et OCR), qui évite tout envoi de plan à un tiers
- L'OCR ne lira jamais les cotes graphiques d'un plan papier — bien communiquer cette limite aux utilisateurs pour éviter toute fausse attente

---

## 9. RÉSUMÉ EN UNE PHRASE POUR LE PROJET CLAUDE

Construire Ch1ffra, un outil web simple (HTML/JS, Firebase branché plus tard) qui aide les petites structures mécaniques françaises à préparer leurs devis plus vite, en commençant par un formulaire de calcul assisté (sans extraction automatique), puis en ajoutant un parsing géométrique local des fichiers STEP et un OCR local pour les plans papier — le tout sans jamais dépendre d'un service IA externe.
