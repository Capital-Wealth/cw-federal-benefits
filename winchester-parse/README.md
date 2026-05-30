# Winchester Parse Service

The document-parsing backend for the Federal Benefits intake. Runs on the
**Winchester** host (not Vercel) because it drives the local **`claude` CLI**
(Opus, Max-plan OAuth — **no Anthropic API key, no per-token cost**). The Vercel
app (`src/lib/parsing/document-parser.ts`) calls it over a Cloudflare tunnel.

## Why it exists

The previous parser called the metered Anthropic SDK directly. Every call threw,
and the error was swallowed — intakes came back `Status="AI Parsed"`,
`AI_Parse_Confidence=0`, all fields null (looked parsed, populated nothing). This
service replaces that path and makes parsing **verifiable**.

## Perfect-parsing contract

1. **Extract-only** — transcribe printed values; sum/annualize is allowed ONLY
   over line items printed on the page; never estimate, infer, or derive an
   absent value (e.g. SS-at-62 from FRA → that's the calc engine's job, not the
   parser's). Absent → `null`.
2. **Independent verify** — every document is parsed **twice, blind**. A field is
   `accepted` only when both passes return the identical value; any disagreement
   (or present-in-one-pass-only) is `flagged`, never written.
3. **No swallowing** — a failed parse surfaces its error, never a silent empty.

## API

```
POST https://parse.mysupertool.app/parse      header: x-parse-secret: <secret>
  body  { mime, docBase64, prompt }
  -> { accepted: {dotPath: value}, flagged: [{path, passA, passB}], passes: [A,B] }
GET  /health  ->  { ok: true, model }
```

## Deploy / operate (on Winchester)

```
# service (port 18795) + tunnel, both launchd KeepAlive:
cp com.capitalwealth.federal-parse.plist ~/Library/LaunchAgents/   # set real PARSE_SECRET
cp com.cloudflare.cw-parse.plist        ~/Library/LaunchAgents/
cp cw-parse-config.yml                  ~/.cloudflared/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.capitalwealth.federal-parse.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cloudflare.cw-parse.plist
```

- Secret lives in `~/cw-federal-parse/.secret` and the local launchd plist
  (redacted here). The same value must be set as `PARSE_SERVICE_SECRET` in the
  Vercel project env.
- Tunnel id `86ab91e3-bdb8-4dc5-8542-8615649b8658` → `parse.mysupertool.app`.
- **Caveat:** Winchester is this Mac — parsing pauses when it sleeps. Acceptable
  because parsing is advisor-triggered and retryable; not customer-facing.
