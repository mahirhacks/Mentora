export type RealtimeTokenResponse = {
  value: string;
  expiresAt?: number;
  session?: unknown;
};

export async function fetchRealtimeToken(): Promise<RealtimeTokenResponse> {
  const res = await fetch("/api/realtime/token", { method: "POST" });
  const data = (await res.json()) as RealtimeTokenResponse & {
    error?: string;
    message?: string;
  };
  if (!res.ok || !data.value) {
    throw new Error(
      data.message || data.error || `token request failed (${res.status})`,
    );
  }
  return data;
}
