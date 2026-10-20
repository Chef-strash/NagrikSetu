import test from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, isProtectedPath, hasAuthCookie } from "./next-path.ts";

test("safeNextPath allows relative paths only", () => {
  assert.equal(safeNextPath("/profile?x=1"), "/profile?x=1");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("/\\evil.com"), "/");
  assert.equal(safeNextPath("/auth/signin"), "/");
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath("javascript:alert(1)", "/x"), "/x");
});

test("isProtectedPath", () => {
  assert.ok(isProtectedPath("/profile"));
  assert.ok(isProtectedPath("/sessions/abc"));
  assert.ok(!isProtectedPath("/schemes"));
  assert.ok(!isProtectedPath("/profiles"));
});

test("hasAuthCookie", () => {
  assert.ok(hasAuthCookie(["a", "sb-abc-auth-token"]));
  assert.ok(hasAuthCookie(["sb-abc-auth-token.0"]));
  assert.ok(!hasAuthCookie(["sb-abc-auth-token-code-verifier"]));
});
