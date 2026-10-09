# NoiseCapture HTML

**NoiseCapture HTML est un port Web indépendant, réalisé en HTML, CSS et JavaScript, inspiré de NoiseCapture. Ce n’est pas l’application Android NoiseCapture, ni un portage Android, un APK ou un produit officiel de l’équipe NoiseCapture.**

Ce dépôt est un fork du projet Android [NoiseCapture d’Ifsttar / Université Gustave Eiffel](https://github.com/Ifsttar/NoiseCapture). Le code Android d’origine reste présent dans le dépôt comme projet source distinct ; l’application Web décrite ici est la version ajoutée à la racine (`index.html`, `styles.css` et `app.js`). Elle s’exécute dans un navigateur et ne nécessite ni Android, ni Gradle, ni installation.

> **Assistance de l’IA :** la conception et la réalisation du port HTML ont été effectuées avec l’assistance d’un outil d’intelligence artificielle. Le code et le comportement doivent être vérifiés avant tout usage pour lequel la précision des mesures est importante.

## Fonctionnalités Web

- Mesure en direct du niveau relatif reçu par le microphone, affiché sur une échelle indicative de 0 à 100.
- Démarrage, pause, reprise et arrêt d’une session.
- Relevés périodiques, courbe d’évolution et statistiques (Leq calculé à partir des relevés, minimum, maximum, L10, L50 et L90).
- Enregistrement facultatif de la position GPS et affichage des points de la session.
- Note par session, historique dans le navigateur et exports individuels en CSV ou en JSON pour tout l’historique.
- Réglage de gain indicatif à partir d’un sonomètre de référence.
- Interface adaptative pour écran mobile et ordinateur.

## Limites et précision

Cette version Web ne reproduit pas le traitement acoustique de l’application Android d’origine et ne doit pas être considérée comme son équivalent fonctionnel ou métrologique.

Sans calibration, le niveau affiché est **une échelle relative de 0 à 100 calculée à partir du signal numérique du microphone**. Le zéro de cette échelle correspond au seuil de silence numérique ; ce n’est ni 0 dB SPL, ni le seuil d’audition. Les microphones et leurs gains diffèrent d’un appareil à l’autre : ces valeurs ne sont pas comparables comme des niveaux acoustiques absolus.

Le réglage avec un sonomètre compense uniquement un décalage de gain. Il ne calibre pas la réponse en fréquence et cette version Web **n’applique pas de pondération A**. Même après ce réglage, les résultats sont indicatifs et ne sont pas des mesures certifiées en dB(A).

## Lancer l’application

Depuis la racine du dépôt, lancez un serveur HTTP local :

```sh
python3 -m http.server 8000
```

Ouvrez ensuite <http://localhost:8000> dans un navigateur récent.

Le navigateur demande l’autorisation d’utiliser le microphone lors du démarrage d’une mesure. La position GPS est facultative et nécessite une autorisation distincte. Les navigateurs autorisent généralement l’accès au microphone et à la géolocalisation uniquement en contexte sécurisé : `localhost` en développement ou HTTPS lors d’un hébergement.

## Données et confidentialité

- L’application analyse le microphone en direct et **n’enregistre pas l’audio**.
- Aucune session n’est envoyée à un serveur par cette application.
- Les sessions et les réglages sont conservés dans le stockage local du navigateur utilisé. Ils ne sont pas synchronisés entre navigateurs ou appareils ; effacer les données du site peut les supprimer.
- Les coordonnées GPS ne sont ajoutées aux relevés que si le navigateur fournit une position autorisée.
- Une session peut être exportée en CSV ; tout l’historique peut être exporté en JSON depuis la page Historique.
- Un lien externe vers OpenStreetMap permet de visualiser une position lorsqu’elle est disponible.

## Fichiers de l’application Web

| Fichier | Rôle |
| --- | --- |
| `index.html` | Pages Mesure, Historique, Résultats et À propos. |
| `styles.css` | Présentation adaptative et styles de l’interface. |
| `app.js` | Capture et analyse audio côté navigateur, géolocalisation, statistiques, stockage et exports. |
| `README.md` | Documentation de cette version Web et distinction avec l’application Android d’origine. |

## Projet Android d’origine

Le projet Android NoiseCapture vise la mesure du bruit environnemental sur téléphone, avec traitement audio, géolocalisation, statistiques et partage communautaire. Sa documentation, son code Android et ses versions officielles sont disponibles sur le [dépôt source Ifsttar / Université Gustave Eiffel](https://github.com/Ifsttar/NoiseCapture), sur le [site Noise-Planet](https://noise-planet.org/) et sur le [Google Play Store](https://play.google.com/store/apps/details?id=org.noise_planet.noisecapture).

Les changements de l’application Web dans ce fork ne modifient pas le code de l’application Android d’origine.

## Licence et attribution

Le projet Android d’origine est publié sous GNU General Public License v3. Consultez le fichier [`LICENSE`](LICENSE) pour le texte de la licence applicable au dépôt et les notices d’attribution conservées avec le projet. NoiseCapture et Noise-Planet sont les projets de leurs auteurs d’origine ; ce port Web indépendant ne signifie pas qu’ils l’approuvent ou le maintiennent.
