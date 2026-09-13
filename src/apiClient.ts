// Talking to the API as a signed-in person.
//
// The session token lives in localStorage and goes in an Authorization header.
// Not a cookie: the site and the API are on different domains, and browsers
// now block cross-site cookies by default. A 401 anywhere clears the token and
// tells the app, so an expired session sends the person to the sign-in page
// instead of leaving a screen of silent failures.

import { API_BASE } from './api';

const TOKEN_KEY = 'crnm_session_token';
export const SIGNED_OUT_EVENT = 'crnm:signed-out';

export class ApiError extends Error {
  readonly status: number;
  /** A list of things to fix, when the API gave one. */
  readonly blockers: string[];

  constructor(status: number, message: string, blockers: string[] = []) {
    super(message);
    this.status = status;
    this.blockers = blockers;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session lasts as long as the page */
  }
}

/** Turn any error body the API sends into one message and an optional list. */
export function readError(status: number, body: unknown): ApiError {
  if (status === 0) {
    return new ApiError(0, "Couldn't reach the server. Check your signal and try again.");
  }
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return new ApiError(status, detail);
  if (Array.isArray(detail)) {
    // FastAPI's validation errors: a list of { loc, msg }.
    const messages = detail
      .map((item) => String((item as { msg?: string }).msg ?? '').replace(/^Value error, /, ''))
      .filter(Boolean);
    return new ApiError(status, messages.join(' ') || 'Please check the form.');
  }
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: unknown; blockers?: unknown };
    return new ApiError(
      status,
      typeof d.message === 'string' ? d.message : 'Something went wrong.',
      Array.isArray(d.blockers) ? d.blockers.map(String) : [],
    );
  }
  if (status === 413) return new ApiError(status, 'That file is too big.');
  return new ApiError(status, 'Something went wrong. Please try again.');
}

function noticeSignedOut(status: number): void {
  if (status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
}

async function request(path: string, options: FetchOptions): Promise<Response> {
  const { json, headers, ...rest } = options;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...authHeader(),
        ...((headers as Record<string, string> | undefined) ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw readError(0, null);
  }
  if (!res.ok) {
    noticeSignedOut(res.status);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* no JSON body */
    }
    throw readError(res.status, body);
  }
  return res;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A private file (a driver's document), fetched with the session attached. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await request(path, {});
  return res.blob();
}

/**
 * Upload a file as the raw request body, reporting progress. XMLHttpRequest
 * rather than fetch, because fetch still cannot report upload progress, and a
 * driver on one bar of 4G sending a photo of their V5C needs to see it moving.
 */
export function apiUpload<T>(
  path: string,
  file: Blob,
  params: Record<string, string | null | undefined>,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${path}?${query.toString()}`);
    for (const [key, value] of Object.entries(authHeader())) xhr.setRequestHeader(key, value);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* no JSON body */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
      } else {
        noticeSignedOut(xhr.status);
        reject(readError(xhr.status, body));
      }
    };
    xhr.onerror = () => reject(readError(0, null));
    xhr.send(file);
  });
}
