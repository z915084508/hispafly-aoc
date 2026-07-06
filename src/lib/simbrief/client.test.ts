import assert from "node:assert/strict";
import { getSimBriefConfig, buildSimBriefApiUrl } from "./config.ts";
import { parseSimBriefError } from "./errors.ts";
import { navigraphTokenNeedsRefresh } from "./token-policy.ts";
import { buildSimBriefPayload } from "./types.ts";

const previousBaseUrl = process.env.NAVIGRAPH_API_BASE_URL;
process.env.NAVIGRAPH_API_BASE_URL = "https://example.test/v2/";
assert.equal(getSimBriefConfig().apiBaseUrl, "https://example.test/v2");
assert.equal(buildSimBriefApiUrl("/v2/flightplans"), "https://example.test/v2/flightplans");
if (previousBaseUrl === undefined) delete process.env.NAVIGRAPH_API_BASE_URL;
else process.env.NAVIGRAPH_API_BASE_URL = previousBaseUrl;

const now = Date.parse("2026-07-06T12:00:00Z");
assert.equal(navigraphTokenNeedsRefresh(new Date(now - 1), now), true);
assert.equal(navigraphTokenNeedsRefresh(new Date(now + 120_000), now), false);

assert.deepEqual(buildSimBriefPayload({ origin: "LEVC", optional: undefined, nested: { keep: 1, remove: undefined } }), { origin: "LEVC", nested: { keep: 1 } });

const unauthorized = parseSimBriefError(401, {});
assert.equal(unauthorized.reconnectRequired, true);
assert.match(unauthorized.message, /Reconnect Navigraph/);
assert.equal(parseSimBriefError(400, { message: "Invalid origin." }).message, "Invalid origin.");
assert.match(parseSimBriefError(500, {}).message, /temporarily unavailable/);

console.log("SimBrief API client: 10 assertions passed.");

