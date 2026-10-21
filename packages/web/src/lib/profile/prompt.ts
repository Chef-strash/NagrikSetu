// Onboarding nudge shown on the dashboard: "set your profile".
//
// Pure so it can be unit-tested without a DOM - the component owns the storage.

import type { UserProfile } from "../context/AppContext";

/** Where the browser remembers that the nudge was dismissed. */
export const PROFILE_PROMPT_STORAGE_KEY = "nagriksetu.profile-prompt-dismissed";

export type ProfilePromptFact = "ward" | "income" | "category";

/**
 * The profile facts scheme matching actually reads. A profile missing any of them
 * weakens every eligibility answer, which is what the nudge exists for.
 */
export function missingProfileFacts(
  profile: Pick<UserProfile, "ward" | "income" | "category">
): ProfilePromptFact[] {
  const missing: ProfilePromptFact[] = [];
  if (!profile.ward.trim()) missing.push("ward");
  if (!(profile.income > 0)) missing.push("income");
  if (!profile.category.trim()) missing.push("category");
  return missing;
}

/**
 * Show the prompt on the dashboard?
 *
 * - Never for anonymous visitors: the public hero asks nothing of them.
 * - Otherwise once per browser, until it is dismissed or the citizen saves the
 *   profile. `dismissed` comes from localStorage, so clearing site data brings
 *   the nudge back rather than losing it forever.
 */
export function shouldPromptProfile(input: {
  isAuthenticated: boolean;
  dismissed: boolean;
}): boolean {
  return input.isAuthenticated && !input.dismissed;
}
