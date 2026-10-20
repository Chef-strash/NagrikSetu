// Maps the signed-in citizen's profile onto the chatbot's optional `profile`
// payload (backend normaliseProfile). Only coarse eligibility facts - never name,
// mobile or any identifier.

export interface ChatProfile {
  ward?: string;
  category?: string;
  rationCard?: string;
  disabilityStatus?: string;
  dbtEnabled?: boolean;
  incomeBand?: string;
  income?: number;
}

export interface ProfileLike {
  ward?: string;
  category?: string;
  rationCard?: string;
  disabilityStatus?: string;
  dbtEnabled?: boolean;
  income?: number;
}

/** Returns undefined when the profile carries nothing useful (not yet filled). */
export function toChatProfile(user: ProfileLike | null | undefined): ChatProfile | undefined {
  if (!user) return undefined;
  const out: ChatProfile = {};
  if (user.ward?.trim()) out.ward = user.ward.trim();
  if (user.category?.trim()) out.category = user.category.trim();
  if (user.rationCard?.trim()) out.rationCard = user.rationCard.trim();
  if (user.disabilityStatus?.trim()) out.disabilityStatus = user.disabilityStatus.trim();
  if (typeof user.dbtEnabled === "boolean") out.dbtEnabled = user.dbtEnabled;
  if (typeof user.income === "number" && user.income > 0) {
    out.income = user.income;
    out.incomeBand = `Rs ${Math.round(user.income)} per year`;
  }
  // A lone default dbtEnabled=true on an empty profile is not worth sending.
  const meaningful = Object.keys(out).filter((k) => k !== "dbtEnabled");
  return meaningful.length > 0 ? out : undefined;
}
