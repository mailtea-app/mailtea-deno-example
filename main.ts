/**
 * A small Deno HTTP service that sends email through Mailtea.
 *
 *   POST /send        { "to", "subject", "html" | "text" }  ->  { "id": "txemail_..." }
 *   GET  /emails/:id                                        ->  delivery status of that message
 */
import { Mailtea, MailteaError } from "npm:mailtea-sdk@0.11.0";

/**
 * Routing is separated from process startup so the tests can hand it a client
 * pointed at the bundled mock server instead of the real API.
 */
export function createHandler(mailtea: Mailtea, from: string) {
  return async function handler(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/send") {
      return await send(mailtea, from, request);
    }

    const email = pathname.match(/^\/emails\/([^/]+)$/);
    if (request.method === "GET" && email) {
      return await status(mailtea, email[1]);
    }

    return json({ error: "Not Found" }, 404);
  };
}

async function send(
  mailtea: Mailtea,
  from: string,
  request: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  // `null`, arrays and numbers are all valid JSON, and none of them is a send.
  // Reject them here: destructuring `null` would throw past this handler and
  // turn a bad request into a 500.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Body must be a JSON object" }, 400);
  }

  const { to, subject, html, text } = body as {
    to?: string | string[];
    subject?: string;
    html?: string;
    text?: string;
  };

  // Validate before calling out, so a malformed request costs no round trip.
  if (!to || !subject || (!html && !text)) {
    return json(
      { error: "to, subject, and one of html or text are required" },
      400,
    );
  }

  try {
    const { id } = await mailtea.emails.send({ from, to, subject, html, text });
    return json({ id }, 202);
  } catch (error) {
    return failure(error);
  }
}

async function status(mailtea: Mailtea, id: string): Promise<Response> {
  try {
    const email = await mailtea.emails.get(id);
    return json({
      id: email.id,
      subject: email.subject,
      status: email.last_event,
    });
  } catch (error) {
    return failure(error);
  }
}

/**
 * Mailtea's own errors carry the status and message the API returned — pass
 * both through rather than flattening every failure into a 500, so a caller can
 * tell a bad address (422) from an outage.
 */
function failure(error: unknown): Response {
  if (error instanceof MailteaError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error("Unexpected error while calling Mailtea:", error);
  return json({ error: "Could not reach Mailtea" }, 502);
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `${name} is not set — copy .env.example to .env and fill it in`,
    );
  }
  return value;
}

if (import.meta.main) {
  const mailtea = new Mailtea(required("MAILTEA_API_KEY"), {
    // Only needed for local dev or a self-hosted Mailtea. Omit in production.
    baseUrl: Deno.env.get("MAILTEA_API_BASE_URL"),
  });

  // A blank `PORT=` in a .env file reads as "", and `Number("")` is 0 — which
  // would bind an arbitrary free port instead of the documented default.
  Deno.serve(
    { port: Number(Deno.env.get("PORT") || 8000) },
    createHandler(mailtea, required("MAILTEA_FROM")),
  );
}
