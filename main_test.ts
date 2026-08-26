/**
 * These run against the bundled mock Mailtea server, so they need no API key
 * and reach nothing outside the machine.
 *
 * The mock is the shared Node one, imported unchanged — Deno runs it as-is
 * through its `node:http` compatibility layer.
 */
import {
  assertEquals,
  assertExists,
  assertObjectMatch,
} from "jsr:@std/assert@^1.0.0";
import { Mailtea } from "npm:mailtea-sdk@0.11.0";
import { startMockMailtea } from "./test/mock-mailtea.mjs";
import { createHandler } from "./main.ts";

const FROM = "Mailtea Examples <examples@example.test>";

/** Runs `body` against a fresh mock, and always shuts the mock down after. */
async function withMock(
  body: (mock: Awaited<ReturnType<typeof startMockMailtea>>) => Promise<void>,
) {
  const mock = await startMockMailtea();
  try {
    await body(mock);
  } finally {
    await mock.close();
  }
}

Deno.test("POST /send calls POST /v1/emails and returns the new email id", async () => {
  await withMock(async (mock) => {
    const handler = createHandler(
      new Mailtea("mt_pat_test", { baseUrl: mock.url }),
      FROM,
    );

    const response = await handler(
      new Request("http://localhost/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: "reader@mailtea.test",
          subject: "Hello from Deno",
          html: "<p>Hi</p>",
        }),
      }),
    );

    assertEquals(response.status, 202);
    assertEquals(await response.json(), {
      id: "txemail_00000000000000000000000000000000",
    });

    assertEquals(mock.requests.length, 1);
    const sent = mock.last;
    assertExists(sent);
    assertEquals(sent.method, "POST");
    assertEquals(sent.path, "/v1/emails");
    assertEquals(sent.authorization, "Bearer mt_pat_test");
    assertObjectMatch(sent.body, {
      from: FROM,
      to: "reader@mailtea.test",
      subject: "Hello from Deno",
      html: "<p>Hi</p>",
    });
  });
});

Deno.test("GET /emails/:id reports the message's delivery status", async () => {
  await withMock(async (mock) => {
    const handler = createHandler(
      new Mailtea("mt_pat_test", { baseUrl: mock.url }),
      FROM,
    );

    const response = await handler(
      new Request(
        "http://localhost/emails/txemail_00000000000000000000000000000000",
      ),
    );

    assertEquals(response.status, 200);
    assertObjectMatch(await response.json(), {
      id: "txemail_00000000000000000000000000000000",
      status: "delivered",
    });
    const fetched = mock.last;
    assertExists(fetched);
    assertEquals(fetched.method, "GET");
    assertEquals(
      fetched.path,
      "/v1/emails/txemail_00000000000000000000000000000000",
    );
    assertEquals(fetched.authorization, "Bearer mt_pat_test");
  });
});

Deno.test("an incomplete send is rejected before any request is made", async () => {
  await withMock(async (mock) => {
    const handler = createHandler(
      new Mailtea("mt_pat_test", { baseUrl: mock.url }),
      FROM,
    );

    const response = await handler(
      new Request("http://localhost/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "reader@mailtea.test" }),
      }),
    );

    assertEquals(response.status, 400);
    assertEquals(mock.requests.length, 0);
  });
});

Deno.test("a Mailtea error keeps its own status instead of becoming a 500", async () => {
  await withMock(async (mock) => {
    // A misconfigured MAILTEA_API_BASE_URL is the everyday way this happens.
    const handler = createHandler(
      new Mailtea("mt_pat_test", { baseUrl: `${mock.url}/wrong` }),
      FROM,
    );

    const response = await handler(
      new Request("http://localhost/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: "reader@mailtea.test",
          subject: "Hi",
          text: "Hi",
        }),
      }),
    );

    assertEquals(response.status, 404);
    const attempted = mock.last;
    assertExists(attempted);
    assertEquals(attempted.path, "/wrong/v1/emails");
  });
});

Deno.test("a JSON body that is not an object is a 400, not a crash", async () => {
  await withMock(async (mock) => {
    const handler = createHandler(
      new Mailtea("mt_pat_test", { baseUrl: mock.url }),
      FROM,
    );

    // Every one of these parses as JSON, so the `request.json()` catch does not
    // fire — they have to be turned away on shape instead.
    for (const payload of ["null", "[]", '"hello"', "5", "true"]) {
      const response = await handler(
        new Request("http://localhost/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
        }),
      );

      assertEquals(response.status, 400, `expected 400 for body ${payload}`);
      await response.body?.cancel();
    }

    assertEquals(mock.requests.length, 0);
  });
});

Deno.test("unknown routes are 404", async () => {
  await withMock(async (mock) => {
    const handler = createHandler(
      new Mailtea("mt_pat_test", { baseUrl: mock.url }),
      FROM,
    );
    const response = await handler(new Request("http://localhost/nope"));
    assertEquals(response.status, 404);
    assertEquals(mock.requests.length, 0);
  });
});
