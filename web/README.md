# Spark PWA

Spark s'ouvre sans compte et fonctionne hors ligne après une première visite en ligne, grâce au service worker. Les idées et les suggestions créatives sont enregistrées et générées sur l'appareil. Aucune connexion n'est nécessaire au quotidien.

Le menu **Sauvegarde** permet d'exporter toutes les idées au format JSON et de les réimporter sur le même appareil ou un autre. Ce fichier doit être conservé par l'utilisateur : effacer les données du navigateur supprime les idées locales.

Pour la transition depuis l'ancienne version, Spark tente une seule fois de récupérer les anciennes idées Supabase si une session Google existe déjà. Une récupération manuelle, facultative, est disponible dans **Sauvegarde → Récupérer mes anciennes idées**. Elle ne crée pas de synchronisation continue.

L'extension Chrome actuelle utilise toujours Supabase. Ses nouvelles captures n'apparaissent donc pas automatiquement dans cette version locale de la PWA. L'extension devra être adaptée pour transférer explicitement ses captures à la PWA si ce parcours est souhaité.
