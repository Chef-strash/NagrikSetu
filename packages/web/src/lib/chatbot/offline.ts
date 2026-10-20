export const OFFLINE_NOTICE = "Offline mode - answers may be generic.";

/** Marker line prepended to every offline message so the UI can show it. */
export function withOfflineNotice(text: string): string {
  return `${OFFLINE_NOTICE}\n\n${text}`;
}

/** Generic guidance used only when the chatbot service is unreachable. No scheme-specific facts. */
export function offlineReply(text: string, counter?: { desk?: string; hours?: string }): string {
  const lower = text.toLowerCase();
  const desk = counter?.desk?.trim();
  let body: string;
  if (lower.includes("hours") || lower.includes("time") || lower.includes("when")) {
    body = counter?.hours?.trim()
      ? `The listed working hours${desk ? ` for ${desk}` : ""} are ${counter.hours}. Please confirm with the ward office before you go.`
      : "Counter timings are not available offline. Please confirm them with your ward office before you go.";
  } else if (lower.includes("photo") || lower.includes("passport")) {
    body = "Photo requirements differ by scheme. Check the document list for this scheme, and carry a few recent passport-size photos to be safe.";
  } else if (lower.includes("digilocker") || lower.includes("online") || lower.includes("certificate")) {
    body = "Many offices accept DigiLocker or online printouts if they are clear and legible, but this varies. Please confirm with the counter.";
  } else if (lower.includes("bank") || lower.includes("ifsc") || lower.includes("account")) {
    body = "Grants are generally paid to a bank account in the applicant's own name, linked to Aadhaar. If your bank has merged, check that the IFSC code on your passbook is current.";
  } else {
    body = "I can't reach the scheme assistant right now. Please try again shortly, or confirm details with your ward office.";
  }
  return withOfflineNotice(body);
}

/** Opening message for the local keyword-match path (no backend decomposition). */
export function offlineMatchMessage(query: string, schemeName: string): string {
  return withOfflineNotice(
    `Based on your search for "${query}", the closest scheme in the offline list is ${schemeName}. Open the scheme page to review its details, then upload your documents on the right and click Check.`
  );
}
