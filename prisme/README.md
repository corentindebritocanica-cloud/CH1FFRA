# Prisme

Application web installable (PWA) écrite de zéro en HTML, CSS et JavaScript, sans dépendance ni étape de build.
Elle est pensée pour l’**iPhone 16 Pro Max** (ajoutée à l’écran d’accueil depuis Safari) et pour **Microsoft Edge sous Windows** (installée comme application).

Un faisceau de lumière traverse un prisme et se décompose en six rayons. Chaque rayon, avec sa longueur d’onde réelle, ouvre une expérience calculée en temps réel sur l’appareil :

| λ | Expérience | Ce qu’elle montre |
|---|---|---|
| 680 nm | **Synthé** | Instrument multi-touch et compositeur génératif en Web Audio : synthèse FM et soustractive, réverbération à convolution générée, délai ping-pong, séquenceur à anticipation, clavier d’ordinateur, MIDI (Edge), enregistrement audio. |
| 610 nm | **Fractale** | Ray-marching temps réel du Mandelbulb, de la Mandelbox et de l’éponge de Menger : ombres douces, occlusion ambiante, résolution dynamique, affinage à l’arrêt (le GPU se met au repos). |
| 580 nm | **Vision** | Caméra filtrée par shaders WebGL2 : néon (Sobel), ASCII, thermique, kaléidoscope, trame CMJ, glitch, peinture (Kuwahara), rétro (Bayer). Capture en pleine résolution, import de photo ou de vidéo. |
| 530 nm | **Système** | Radiographie de l’appareil : rafraîchissement mesuré (ProMotion 120 Hz), écran et zones sûres, GPU, niveau à bulle, bancs d’essai processeur (Web Workers) et GPU (compute shader, GFLOPS), inventaire de 60 API web, synthèse vocale, pastille d’icône. |
| 470 nm | **Fluide** | Navier-Stokes incompressible sur le GPU : advection, vorticité, projection de pression, relief, halo lumineux. Multi-touch et gravité pilotée par le gyroscope. |
| 410 nm | **Nébuleuse** | Jusqu’à 2 millions de particules en compute shaders **WebGPU** avec accumulation atomique (galaxie à onde de densité, attracteur d’Aizawa, flot rotationnel). Repli WebGL2 par transform feedback. |

## Points forts de l’application

- **Installable et hors-ligne** : manifeste complet (icônes, icône maskable, raccourcis, captures, `window-controls-overlay`, panneau latéral d’Edge), service worker qui met toute l’app en cache et propose les mises à jour.
- **Pensée pour l’iPhone 16 Pro Max** : zones sûres autour de la Dynamic Island, barre d’état translucide, écrans de lancement 1320×2868 et 2868×1320, retour haptique via l’interrupteur natif d’iOS 18+, son actif même en mode silencieux (Audio Session API), verrou de mise en veille, gestes multi-touch et pincement.
- **Pensée pour Edge sous Windows** : invite d’installation, barre de titre intégrée, raccourcis clavier (`1`–`6`, `Échap`, `S`, `H`, `F`, `P`, `?`), palette de commandes `Ctrl+K`, enregistrement via la boîte « Enregistrer sous », MIDI.
- **Robuste** : transitions de vue, reprise après perte du contexte GPU, replis WebGPU → WebGL2 et caméra → source de démonstration, respect de « Réduire les animations ».

## Mettre l’app en ligne (GitHub Pages)

Une adresse HTTPS est nécessaire pour l’installation, la caméra, les capteurs et le mode hors-ligne.

1. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. Fusionnez cette branche dans `main`, ou lancez le workflow **Déployer Prisme** à la main (onglet *Actions*).
3. L’app est publiée à l’adresse `https://<compte>.github.io/<dépôt>/`.

## Installer

**iPhone (Safari)** : ouvrez l’adresse, touchez **Partager** (dans le menu **•••** sur iOS 26), puis **Sur l’écran d’accueil**, laissez **Ouvrir comme app web** activé et touchez **Ajouter**.

**Windows (Edge)** : ouvrez l’adresse, cliquez l’icône d’installation dans la barre d’adresse (ou menu **···** → **Applications** → **Installer Prisme**).

## Lancer en local

```bash
npx http-server prisme -p 8080 -c-1
# puis http://localhost:8080
```

`localhost` est considéré comme sécurisé : service worker, WebGPU et caméra y fonctionnent.

## Structure

```
prisme/
├── index.html              coquille, méta-données iOS, pictogrammes
├── manifest.webmanifest    manifeste de l’application
├── sw.js                   service worker (cache versionné)
├── css/app.css             design (verre, spectre, zones sûres)
├── js/app.js               navigation, réglages, installation, clavier, palette
├── js/core/kit.js          environnement, haptique, boucle, partage, capteurs
├── js/core/gl.js           aides WebGL2
├── js/modules/*.js         les six expériences, chargées à la demande
├── js/workers/bench.js     banc d’essai processeur
├── fonts/                  Unbounded et JetBrains Mono (SIL Open Font License)
└── icons/                  icônes, écrans de lancement, captures
```

Pour publier une nouvelle version, incrémentez `VERSION` dans `sw.js` (et `js/app.js`) : l’app proposera alors « Recharger » à ses utilisateurs.
