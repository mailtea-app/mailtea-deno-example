# Mailtea + Deno Example

This example shows how to use [Mailtea](https://mailtea.app) with Deno to run a
small HTTP service that sends an email on `POST /send` and reports its delivery
status on `GET /emails/:id`.

## Prerequisites

To get the most out of this guide, you'll need to:

- [Create an API key](https://studio.mailtea.app/api-keys)
- [Verify your domain](https://docs.mailtea.app/docs/documentation/domains)
- [Install Deno 2](https://docs.deno.com/runtime/getting_started/installation)

## Instructions

1. Install dependencies:
   ```bash
   deno install
   ```
   Deno resolves `npm:mailtea-sdk@0.11.0` straight from the import in `main.ts`,
   so this step only warms the cache — `deno task start` works without it.
2. Copy `.env.example` to `.env` and add your API key:
   ```bash
   cp .env.example .env
   ```
3. Run it:
   ```bash
   deno task start
   ```
4. Send something:
   ```bash
   curl -X POST http://localhost:8000/send \
     -H 'content-type: application/json' \
     -d '{"to":"reader@yourdomain.com","subject":"Hello","html":"<p>Hi</p>"}'
   ```
   The response is `{"id":"txemail_..."}`. Pass that id back to check on it:
   ```bash
   curl http://localhost:8000/emails/txemail_...
   ```

## What this example covers

- Importing the Node SDK in Deno with an `npm:` specifier — no `package.json`,
  no build step
- Serving HTTP with `Deno.serve()` and the standard `Request`/`Response` types
- Sending with `mailtea.emails.send()` and reading status with
  `mailtea.emails.get()`
- Passing a `MailteaError` through with the status the API returned, instead of
  collapsing every failure into a 500
- Explicit Deno permissions: the service only ever needs `--allow-net` and
  `--allow-env`

## Tests

```bash
deno task test
```

The tests run against a bundled mock Mailtea server, so they need no API key and
make no network calls. The mock (`test/mock-mailtea.mjs`) is the shared Node
one, imported unchanged — Deno runs it through its `node:http` compatibility
layer.

## Learn more

- [Documentation](https://docs.mailtea.app)
- [API reference](https://docs.mailtea.app/docs/api-reference)
- [Node.js SDK](https://github.com/mailtea-app/mailtea-node) ·
  [Python SDK](https://github.com/mailtea-app/mailtea-python) ·
  [MCP server](https://github.com/mailtea-app/mailtea-mcp)
