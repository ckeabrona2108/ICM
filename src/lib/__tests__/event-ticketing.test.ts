import assert from "node:assert/strict";
import test from "node:test";

import { buildTicketCheckUrl, __eventTicketingTestUtils } from "@/lib/event-ticketing";

test("buildTicketCheckUrl creates public validation URL", () => {
  const url = buildTicketCheckUrl("abc123", "https://icecreammusic.net");
  assert.equal(url, "https://icecreammusic.net/ticket/check/abc123");
});

test("parseTicketReference extracts public token from QR URL", () => {
  const parsed = __eventTicketingTestUtils.parseTicketReference(
    "https://icecreammusic.net/ticket/check/token-xyz"
  );
  assert.equal(parsed.publicToken, "token-xyz");
  assert.equal(parsed.ticketCode, null);
});

test("resolvePublicCheckResult maps statuses to public check states", () => {
  assert.equal(__eventTicketingTestUtils.resolvePublicCheckResult("PAID"), "valid");
  assert.equal(__eventTicketingTestUtils.resolvePublicCheckResult("USED"), "already_used");
  assert.equal(__eventTicketingTestUtils.resolvePublicCheckResult("REFUNDED"), "invalid");
});
