type Result = { error: { message?: string; statusCode?: string | number } | null };

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function submitWithRetry(action: () => Promise<Result>) {
  let lastError: Result["error"] = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await action();
      if (!result.error) return;
      const message = result.error.message?.toLowerCase() ?? "";
      if (String(result.error.statusCode) === "409" || message.includes("duplicate") || message.includes("already exists")) return;
      lastError = result.error;
    } catch (error) {
      lastError = { message: error instanceof Error ? error.message : "network error" };
    }
    if (attempt < 4) await wait(500 * 2 ** attempt);
  }
  throw lastError ?? new Error("submission failed");
}
