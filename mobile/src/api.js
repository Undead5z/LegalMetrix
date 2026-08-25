const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function request(path, { token, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined
    });
  } catch {
    throw new Error(`Cannot reach LegalMetrix backend at ${API_URL}. Restart Expo after checking mobile/.env.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Unable to complete the request.');
  return data;
}

export { API_URL };
