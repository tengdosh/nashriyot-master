# Nashriyot bot (read-only Telegram report assistant)

grammY (TypeScript), long polling, part of the monorepo. **Read-only**: every
number comes from `/api/v1/reports/*` (Bearer `REPORTS_API_TOKEN` + `x-user-id`);
the bot never touches the DB and never writes.

## Flow
- **Linking** — the user gets a one-time 6-digit code on the platform Profil
  page, then sends `/ulash 123456`. The chat is bound to their platform account;
  every request runs with *their* permissions and entity scope.
- **Menu** — `/menu` shows only the reports the user may see.
- **Free question** — plain text goes to Claude tool-use over the whitelisted
  report catalog (`lib/reports-catalog.ts`). The model may only call report
  tools, never sees the DB, and is told not to guess. Degrades to the menu when
  `ANTHROPIC_API_KEY` is unset.

## Commands
`/start` · `/ulash <kod>` · `/menu` · `/obuna` · `/uzish`

## Env
| Var | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather token. **Absent → the bot exits cleanly** (nothing to poll). |
| `REPORTS_API_TOKEN` | Service token for `/api/v1/reports/*` (same value as the platform). |
| `PLATFORM_API_URL` | Base URL of the platform API (default `http://localhost:3100`). |
| `ANTHROPIC_API_KEY` | Optional. Enables free-question AI answers. |
| `BOT_AI_MODEL` | Optional. Default `claude-sonnet-5`. |
| `BOT_AI_DAILY_LIMIT` | Optional per-chat daily AI cap (default 50). |

## Run
```bash
# from repo root
npx tsx bot/src/index.ts
# or as an isolated container
docker compose -f deploy/docker-compose.prod.yml up -d bot
```
