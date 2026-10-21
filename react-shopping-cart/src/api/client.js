// Thin fetch wrapper for the Express + PostgreSQL API in /server.
// In development Vite proxies /api and /uploads to the API (see vite.config.js).
const API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'brozz.token';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage is unavailable (private mode); the session lasts until reload.
  }
};

export const clearToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
};

export const api = async (path, { method = 'GET', body, formData } = {}) => {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Request failed (${response.status})`,
      response.status,
      data
    );
  }
  return data;
};

// Every visitor holds a session: a guest one until they sign up or log in.
export const startGuestSession = async () => {
  const { token, user } = await api('/auth/guest', { method: 'POST' });
  setToken(token);
  return user;
};
