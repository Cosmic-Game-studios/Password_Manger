# Vaultlight – Lokaler Passwort Manager

Vaultlight ist ein auf Next.js basierender, lokal laufender Passwort Manager. Alle Zugangsdaten werden ausschließlich clientseitig mit AES‑GCM (256 Bit) verschlüsselt und im Browser gespeichert. Zusätzlich führt die App bei jedem Eintrag automatische Checks gegen mehrere Leak-Quellen (HaveIBeenPwned API + lokale Dark-Web-Sample-Daten) durch und warnt bei Treffern.

## Features

- 🛡️ **Clientseitige Verschlüsselung** per PBKDF2 (210k Iterationen) + AES-GCM, alles bleibt im Browser.
- 🔐 **Master-Passwort Tresor**: Tresor anlegen/entsperren, Master-Passwort jederzeit sicher wechseln.
- ⚠️ **Automatische Breach-Checks** über mehrere Leak-Datenbanken mit Echtzeit-Warnungen (serverseitiger Threat-Intel-Aggregator).
- 🔁 **Passwort-Generator** mit konfigurierbaren Regeln und Stärkeanalyse.
- ✏️ **Einträge verwalten**: Bearbeiten, löschen oder erneut prüfen – alles mit einem Klick.
- 🕒 **Auto-Lock & Tab-Schutz**: Sperrt den Tresor automatisch nach 5 Minuten Inaktivität oder beim Verlassen des Tabs.
- 🧩 **Chrome Erweiterung**: Sichere Autofill-Erweiterung mit Master-Passwort-Entsperrung und Tresor-Sync.
- 🛡️ **Security Shield**: Erhöhtes Schutzsystem mit Fehlversuchszählern, Sperrzeiten und Notfall-Blockade bei Angriffen.
- 💻 **Desktop-optimierte Oberfläche** mit schneller Übersicht, Copy-Actions und erneuten Checks.

## Schnellstart

1. Abhängigkeiten installieren
   ```bash
   npm install
   ```
2. Entwicklungsserver starten
   ```bash
   npm run dev
   ```
3. Browser öffnen und `http://localhost:3000` aufrufen.
4. Bei der ersten Nutzung ein Master-Passwort setzen. Dieses wird nicht gespeichert – bei Verlust sind die Daten nicht mehr zugänglich.

## Sicherheit & Architektur

- **Speicherung:** Alle Vault-Daten werden verschlüsselt in `localStorage` abgelegt (`vaultlight.encrypted-vault`).
- **Kryptografie:** PBKDF2 mit 210.000 Iterationen (SHA-256) leitet aus dem Master-Passwort einen Schlüssel ab. Daten werden mit AES-GCM (256 Bit) verschlüsselt.
- **Leak-Checks:**
  - Backend: `/api/leaks/check` aggregiert HaveIBeenPwned (k-Anonymity) und Vaultlight Threat-Intel-Feeds.
  - Offline: Kuratierte Dark-Web-Beispieldatenbank (`src/core/leaks/darkWebSample.ts`) als zusätzliche Quelle.
- **Session-Schutz:** Auto-Lock nach 5 Minuten Idle-Time oder Tab-Wechsel; Master-Passwort bleibt nur im Arbeitsspeicher der Sitzung.
- **Master-Passwort-Rotation:** Neues Master-Passwort setzt sofortige Neuverschlüsselung des Tresors durch.
- **Kein Backend:** Die App läuft komplett offline (Breach-Check benötigt Internetverbindung).
- **Security Shield:** Trackt Fehlversuche, erzwingt exponentielle Sperrzeiten und entfernt im Erweiterungsmodus kompromittierte Tresorkopien automatisch.

## Chrome Erweiterung (Autofill)

Eine optionale Browser-Erweiterung erleichtert das sichere Ausfüllen von Logins:

1. Tresor entsperren und `npm run build:extension` ausführen – der Build landet unter `extension/dist`.
2. In Chrome/Edge `chrome://extensions` öffnen, „Entwicklermodus“ aktivieren und „Entpackte Erweiterung laden“ wählen.
3. Den Ordner `extension/dist` auswählen. Die Erweiterung erscheint als „Vaultlight Autofill“.
4. Vaultlight-App im Browser öffnen und im Popup der Erweiterung auf **Synchronisieren** klicken, damit der verschlüsselte Tresor übernommen wird.
5. Master-Passwort im Popup eingeben -> Einträge werden sichtbar. Ein Klick auf „Autofill“ füllt den aktiven Tab aus.

Sicherheitsmaßnahmen der Erweiterung:

- Tresor bleibt verschlüsselt gespeichert; Entsperrung erfolgt nur nach Master-Passwort-Eingabe.
- Automatische Sperre nach 5 Minuten Inaktivität oder manuellem Lock.
- Autofill nur nach explizitem Nutzer-Click; Passwörter werden nicht im Popup gespeichert.
- Synchronisation funktioniert ausschließlich mit Seiten, auf denen der Vaultlight-Tresor geöffnet ist.

## Scripts

- `npm run dev` – Entwicklungsserver starten
- `npm run build` – Produktion-Build erzeugen
- `npm run start` – Produktion-Server starten
- `npm run lint` – ESLint Check (Next.js Vorgaben)

## Hinweise

- Browserdaten löschen ⇒ Tresor löschen. Export/Backup ist aktuell nicht implementiert.
- Für produktive Szenarien sollte ein stärkeres Leak-Check-Backend angebunden werden.
- Clipboard-Aktionen funktionieren nur, wenn der Browser-Zugriff erlaubt.

Viel Spaß beim Testen! Feedback und Erweiterungswünsche sind willkommen.
