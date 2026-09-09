import assert from "node:assert/strict";
import test from "node:test";

import { parseHttpByteRange } from "@/lib/http-byte-range";

test("parseHttpByteRange parses browser audio ranges", () => {
  assert.deepEqual(parseHttpByteRange("bytes=0-1023", 5000), { start: 0, end: 1023 });
  assert.deepEqual(parseHttpByteRange("bytes=1024-", 5000), { start: 1024, end: 4999 });
  assert.deepEqual(parseHttpByteRange("bytes=-500", 5000), { start: 4500, end: 4999 });
});

test("parseHttpByteRange rejects ranges outside the file", () => {
  assert.equal(parseHttpByteRange("bytes=5000-", 5000), null);
  assert.equal(parseHttpByteRange("bytes=20-10", 5000), null);
  assert.equal(parseHttpByteRange("items=0-10", 5000), null);
});
