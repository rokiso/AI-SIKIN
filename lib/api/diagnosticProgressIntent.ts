// Only a user action in this client runtime may automatically start a new POST.
// Reloaded/direct progress links observe existing work and offer explicit recovery.
const intents = new Set<string>();
export function markAnalysisIntent(sessionId: string) {
  intents.add(sessionId);
}
export function consumeAnalysisIntent(sessionId: string) {
  return intents.delete(sessionId);
}
