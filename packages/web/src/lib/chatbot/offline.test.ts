import test from "node:test";
import assert from "node:assert/strict";
import { offlineReply, offlineMatchMessage } from "./offline.ts";

test("offline replies carry the notice and no invented facts", () => {
  for (const q of ["hours?", "photo", "digilocker", "ifsc", "hello"]) {
    const r = offlineReply(q);
    assert.match(r, /^Offline mode - answers may be generic\./);
    assert.doesNotMatch(r, /Kothrud|paperclip|Syndicate|Counter 3/);
  }
});

test("hours come from the scheme's own counter only", () => {
  assert.match(offlineReply("what time", { desk: "Desk 5", hours: "9 to 5" }), /9 to 5/);
  assert.match(offlineReply("what time"), /not available/);
});

test("match message names the scheme", () => {
  assert.match(offlineMatchMessage("q", "Scheme X"), /Scheme X/);
});
