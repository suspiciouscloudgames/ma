const PARTICIPANT_KEY = "mobile-archaeology-participant-id";

export function participantId() {
  try {
    const saved = localStorage.getItem(PARTICIPANT_KEY);
    if (saved && /^[a-f0-9-]{36}$/i.test(saved)) return saved;
    const id = crypto.randomUUID(); localStorage.setItem(PARTICIPANT_KEY, id); return id;
  } catch {
    // Privacy-restricted in-app browsers can deny storage; a per-page identity still prevents shared-Wi-Fi collisions.
    return crypto.randomUUID();
  }
}
