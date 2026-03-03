# Open Brain MCP Server – Anbindung an ChatGPT (chat.openai.com)

Diese Anleitung beschreibt, wie du den Open Brain MCP Server mit ChatGPT verbindest, damit ChatGPT deine persoenliche Wissensdatenbank nutzen kann.

## Voraussetzungen

1. **Open Brain MCP Server laeuft** und ist erreichbar
2. **Oeffentliche HTTPS-URL** – ChatGPT kann nur HTTPS-Endpunkte erreichen. Optionen:
   - Server auf einem VPS/Cloud mit eigenem Domain + TLS-Zertifikat (z.B. Let's Encrypt)
   - Reverse-Proxy (z.B. nginx, Caddy) vor dem Server
   - Tunnel-Dienst (z.B. Cloudflare Tunnel, ngrok) fuer lokale Entwicklung
3. **API Key** (`OPEN_BRAIN_API_KEY`) ist gesetzt

## Schritt-fuer-Schritt Einrichtung

### 1. Server starten

```bash
# Mit Docker Compose (empfohlen)
docker compose up -d

# Oder direkt
cd mcp-server
npm run build && npm start
```

Der Server laeuft auf Port 3000.

### 2. HTTPS sicherstellen

ChatGPT verbindet sich nur ueber HTTPS. Beispiel mit Cloudflare Tunnel fuer lokale Entwicklung:

```bash
cloudflared tunnel --url http://localhost:3000
```

Notiere die oeffentliche URL (z.B. `https://abc123.trycloudflare.com`).

### 3. Verbindung pruefen

Teste die OAuth-Discovery-Endpoints:

```bash
# Resource Metadata
curl https://DEINE-URL/.well-known/oauth-protected-resource

# Authorization Server Metadata
curl https://DEINE-URL/.well-known/oauth-authorization-server

# Health Check
curl https://DEINE-URL/health
```

Alle drei sollten JSON-Antworten liefern.

### 4. In ChatGPT einrichten

1. Oeffne [chat.openai.com](https://chat.openai.com)
2. Gehe zu **Einstellungen** (Settings)
3. Navigiere zu **MCP Servers** / **Connected Tools**
4. Klicke **"Add MCP Server"** oder **"MCP-Server hinzufuegen"**
5. Gib die Server-URL ein: `https://DEINE-URL/mcp`
6. ChatGPT erkennt automatisch die OAuth-Konfiguration ueber die `/.well-known`-Endpoints
7. Du wirst zur **Authorize-Seite** weitergeleitet
8. Gib deinen **API Key** (`OPEN_BRAIN_API_KEY`) ein
9. Klicke **"Authorize"**
10. ChatGPT erhaelt einen Access Token und kann jetzt auf deine Tools zugreifen

### 5. Nutzung

Nach der Autorisierung stehen ChatGPT folgende Tools zur Verfuegung:

- **store_memory** – Wissen in der Datenbank speichern
- **semantic_search** – Semantische Suche im Wissen
- **list_recent** – Neueste Eintraege abrufen
- **get_stats** – Statistiken abrufen
- **delete_memory** – Eintraege loeschen

Du kannst ChatGPT direkt bitten, z.B.:
> "Speichere, dass mein Lieblingsbuch 'Dune' ist"
> "Was weisst du ueber meine Projekte?"

## Ablauf des OAuth-Flows

```
ChatGPT                         Open Brain Server
   |                                    |
   |--- GET /mcp (ohne Auth) ---------->|
   |<-- 401 + WWW-Authenticate --------|
   |                                    |
   |--- GET /.well-known/oauth-        |
   |    protected-resource ------------>|
   |<-- { authorization_servers } ------|
   |                                    |
   |--- GET /.well-known/oauth-        |
   |    authorization-server ---------->|
   |<-- { endpoints, features } --------|
   |                                    |
   |--- GET /authorize?... ------------>|
   |<-- HTML Login-Seite ---------------|
   |                                    |
   |    [User gibt API Key ein]         |
   |                                    |
   |--- POST /authorize (API Key) ----->|
   |<-- 302 Redirect mit ?code=... ----|
   |                                    |
   |--- POST /token (code + PKCE) ---->|
   |<-- { access_token (JWT) } ---------|
   |                                    |
   |--- GET /mcp (Bearer JWT) -------->|
   |<-- MCP Response ------------------|
```

## Fehlerbehebung / Troubleshooting

### "Connection refused" oder Timeout
- Ist der Server gestartet? (`curl http://localhost:3000/health`)
- Ist HTTPS korrekt eingerichtet?
- Firewall-Regeln pruefen (Port 443 muss offen sein)

### "Invalid API key" auf der Authorize-Seite
- Pruefe den Wert von `OPEN_BRAIN_API_KEY` in der `.env`-Datei
- Der Key muss exakt uebereinstimmen (Leerzeichen, Zeilenumbrueche beachten)

### ChatGPT findet die OAuth-Endpoints nicht
- Pruefe, ob `/.well-known/oauth-protected-resource` erreichbar ist
- Die URL muss HTTPS sein (kein HTTP)
- Stelle sicher, dass kein Reverse-Proxy die `/.well-known`-Pfade blockiert

### Token abgelaufen
- Access Tokens sind 1 Stunde gueltig
- ChatGPT sollte automatisch einen neuen Token anfordern
- Falls nicht: Verbindung in den ChatGPT-Einstellungen entfernen und neu hinzufuegen

### "403 Forbidden" bei MCP-Anfragen
- Der Token koennte ungueltig sein (falscher `OPEN_BRAIN_API_KEY` beim Signieren)
- Wurde der `OPEN_BRAIN_API_KEY` nach der Autorisierung geaendert? Dann muss die Verbindung neu hergestellt werden

## Sicherheitshinweise

- Der `OPEN_BRAIN_API_KEY` wird **nur** auf der Authorize-Seite eingegeben und **nie** an ChatGPT uebertragen
- ChatGPT erhaelt nur einen zeitlich begrenzten JWT Access Token
- Tokens sind mit HMAC-SHA256 signiert und an den Server gebunden
- PKCE (S256) schuetzt vor Authorization-Code-Interception
- Verwende immer HTTPS in der Produktion

## Kompatibilitaet

Der OAuth-Flow ist kompatibel mit:
- **ChatGPT** (chat.openai.com) – MCP OAuth
- **Claude** (claude.ai) – MCP OAuth
- **Direkte API-Nutzung** – Bearer Token mit API Key (unveraendert)

Die bestehende Bearer-Token-Authentifizierung mit dem direkten API Key funktioniert weiterhin parallel zum OAuth-Flow.
