# StackFerry

StackFerry ist ein unabhaengiger Fork von [CC Switch](https://github.com/farion1231/cc-switch) zur Verwaltung von Anbietern, API-Endpunkten, Zugangsdaten und lokalen Routen fuer KI-Entwicklungswerkzeuge.

Der aktuelle Upstream-Stand ist CC Switch `3.19.0`. StackFerry verwendet eigene Paket- und Anwendungskennungen, `~/.stackferry/stackferry.db`, das Deep-Link-Schema `stackferry://`, einen eigenen Sync-Namensraum und eigene Release-Artefakte. Daten aus `~/.cc-switch` werden nicht automatisch uebernommen.

Signierte In-App-Installationen bleiben deaktiviert, bis StackFerry einen eigenen Update-Schluessel besitzt. Die Versionspruefung verweist auf die [StackFerry Releases](https://github.com/Ninthless/StackFerry/releases).

## Entwicklung

```bash
pnpm install
pnpm dev
```

```bash
pnpm typecheck
pnpm format:check
pnpm test:unit
```

StackFerry steht unter der [MIT License](LICENSE) und behaelt den urspruenglichen Copyright-Hinweis von CC Switch bei.
