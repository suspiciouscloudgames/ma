export async function postJsonWithRetry(url: string, body: unknown) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status < 500 && response.status !== 408) return response;
    lastError = new Error(`server error ${response.status}`);
  } catch (error) { lastError = error; }
  throw lastError;
}
