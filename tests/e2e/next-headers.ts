/** Simula las cookies del request: la sesión se toma de TEST_SESSION. */
export async function cookies() {
  return { get: (_name: string) => (process.env.TEST_SESSION ? { value: process.env.TEST_SESSION } : undefined) };
}
