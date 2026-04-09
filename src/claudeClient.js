/**
 * Shared wrapper for all Claude API calls.
 * Provides consistent error handling with user-friendly messages for 429/529.
 */
export async function callClaude(body) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      res.status === 529
        ? "Claude is temporarily overloaded — please try again in a moment."
        : res.status === 429
          ? "Rate limit reached — please wait a moment and try again."
          : data.error?.message || "AI request failed."
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
