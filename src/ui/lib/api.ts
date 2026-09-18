export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * fetch wrapper: JSON in/out, and a thrown ApiError carrying the server's
 * `error` message whenever the response is not 2xx.
 */
export async function api<T = unknown>(
  path: string,
  init: Omit<RequestInit, 'body'> & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(headers || {}) } : headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `${res.status} ${res.statusText}`);
  return data as T;
}

/** Stream a File to the import endpoint with upload progress (0-1). */
export function uploadFile(
  file: File,
  params: { folder: string; title?: string; date?: string },
  onProgress: (fraction: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ folder: params.folder, filename: file.name });
    if (params.title) qs.set('title', params.title);
    if (params.date) qs.set('date', params.date);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/import?${qs.toString()}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error during upload'));
    xhr.send(file);
  });
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
