import type { DraftFields, Revision } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(
  path: string,
  options: { body?: unknown; csrf?: string } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`/api${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        data && typeof data === 'object' && 'detail' in data
          ? (data as { detail: unknown }).detail
          : null;
      throw new ApiError(
        typeof detail === 'string'
          ? detail
          : `The request could not be completed (${response.status}).`,
        response.status,
      );
    }
    if (data === null)
      throw new ApiError(
        'The server response could not be read. Retry to recover the saved result.',
        0,
      );
    return data as T;
  } catch (failure) {
    if (failure instanceof ApiError) throw failure;
    const reason = controller.signal.aborted
      ? 'The request timed out.'
      : 'The server could not be reached.';
    throw new ApiError(
      `${reason} Your request may have succeeded; retrying the same operation will recover its result.`,
      0,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

const storageKey = 'opsdesk:v1:';

export function readSaved<T>(key: string): T | null {
  try {
    const saved = localStorage.getItem(storageKey + key);
    return saved ? (JSON.parse(saved) as T) : null;
  } catch {
    return null;
  }
}

export function saveLocal(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(storageKey + key);
    else localStorage.setItem(storageKey + key, JSON.stringify(value));
  } catch {
    // The current tab remains usable when browser storage is disabled.
  }
}

export function isKnownRejection(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function draftFields(revision: Revision): DraftFields {
  return {
    response: revision.response,
    summary: revision.summary,
    priority: revision.priority,
    contact_name: revision.contact_name,
    callback: revision.callback,
  };
}

export function displayDate(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    undefined,
    withTime
      ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  ).format(date);
}
