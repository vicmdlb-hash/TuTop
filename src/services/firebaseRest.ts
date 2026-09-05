import type { FirebaseRuntimeConfig } from './runtimeConfig';

export interface AuthSession {
  uid: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  phone: string;
}

export interface FirestoreDocument<T = Record<string, unknown>> {
  id: string;
  path: string;
  data: T;
  createTime?: string;
  updateTime?: string;
}

export type QueryOperator = 'EQUAL' | 'ARRAY_CONTAINS' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL';
export interface QueryFilter { field: string; op: QueryOperator; value: unknown }
export interface QueryOrder { field: string; direction?: 'ASCENDING' | 'DESCENDING' }

const LEGACY_SESSION_KEY = 'tutop.firebase.session.v1';
const SESSION_KEY_PREFIX = 'tutop.firebase.session.v2.';
const TIMESTAMP_FIELDS = new Set([
  'created_at', 'updated_at', 'fecha_creacion', 'fecha_registro', 'date', 'fecha',
  'suspended_until', 'expires_at', 'last_message_at', 'confirmed_at', 'reviewed_at',
]);

function encodePath(path: string) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

function encodeValue(value: unknown, fieldName?: string): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') {
    if (fieldName && TIMESTAMP_FIELDS.has(fieldName) && isIsoDate(value)) return { timestampValue: new Date(value).toISOString() };
    return { stringValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) fields[key] = encodeValue(item, key);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeValue(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return new Date(value.timestampValue).toISOString();
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {});
  if ('referenceValue' in value) return value.referenceValue;
  return value;
}

function encodeFields(data: Record<string, unknown>) {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) fields[key] = encodeValue(value, key);
  }
  return fields;
}

function decodeFields(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

async function readJson(response: Response) {
  const text = await response.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.error?.status || data?.raw || `HTTP ${response.status}`;
    const error = new Error(String(message));
    (error as any).status = response.status;
    (error as any).payload = data;
    throw error;
  }
  return data;
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeMexicoPhone(input: string) {
  const clean = input.replace(/[^\d+]/g, '');
  if (clean.startsWith('+')) {
    const digits = clean.slice(1).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) throw new Error('Escribe un número válido con lada.');
    return `+${digits}`;
  }
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 10) return `+52${digits}`;
  if (digits.startsWith('52') && digits.length === 12) return `+${digits}`;
  throw new Error('Para México escribe 10 dígitos, por ejemplo 2461234567.');
}

export async function phoneAliasEmail(phone: string) {
  const digest = await sha256(normalizeMexicoPhone(phone));
  return `phone-${digest.slice(0, 40)}@auth.tutop.app`;
}

export class FirebaseRestClient {
  private config: FirebaseRuntimeConfig;
  private session: AuthSession | null = null;

  constructor(config: FirebaseRuntimeConfig) {
    this.config = config;
    this.session = this.readStoredSession();
  }

  get projectId() { return this.config.projectId; }
  get currentSession() { return this.session; }

  private get sessionStorageKey() { return `${SESSION_KEY_PREFIX}${this.config.projectId}`; }

  private readStoredSession(): AuthSession | null {
    try {
      const scoped = localStorage.getItem(this.sessionStorageKey);
      const legacy = !scoped ? localStorage.getItem(LEGACY_SESSION_KEY) : null;
      const raw = scoped || legacy;
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthSession;
      if (!parsed.uid || !parsed.idToken || !parsed.refreshToken) return null;
      if (legacy) {
        localStorage.setItem(this.sessionStorageKey, raw);
        localStorage.removeItem(LEGACY_SESSION_KEY);
      }
      return parsed;
    } catch { return null; }
  }

  private persistSession(session: AuthSession | null) {
    this.session = session;
    localStorage.removeItem(LEGACY_SESSION_KEY);
    if (session) localStorage.setItem(this.sessionStorageKey, JSON.stringify(session));
    else localStorage.removeItem(this.sessionStorageKey);
  }

  signOut() { this.persistSession(null); }

  private async authRequest(endpoint: string, body: Record<string, unknown>) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(this.config.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return readJson(response);
  }

  async registerWithPhonePassword(phoneInput: string, password: string) {
    const phone = normalizeMexicoPhone(phoneInput);
    if (password.length < 8) throw new Error('Tu Clave TuTop debe tener al menos 8 caracteres.');
    const email = await phoneAliasEmail(phone);
    const data = await this.authRequest('accounts:signUp', { email, password, returnSecureToken: true });
    const session: AuthSession = {
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
      phone,
    };
    this.persistSession(session);
    return session;
  }

  async signInWithPhonePassword(phoneInput: string, password: string) {
    const phone = normalizeMexicoPhone(phoneInput);
    const email = await phoneAliasEmail(phone);
    const data = await this.authRequest('accounts:signInWithPassword', { email, password, returnSecureToken: true });
    const session: AuthSession = {
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
      phone,
    };
    this.persistSession(session);
    return session;
  }

  async deleteAuthAccount() {
    const token = await this.getIdToken();
    await this.authRequest('accounts:delete', { idToken: token });
    this.persistSession(null);
  }

  async getIdToken() {
    if (!this.session) throw new Error('AUTH_REQUIRED');
    if (this.session.expiresAt > Date.now() + 60_000) return this.session.idToken;
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.session.refreshToken }),
    });
    const data = await readJson(response);
    const refreshed: AuthSession = {
      ...this.session,
      idToken: data.id_token,
      refreshToken: data.refresh_token || this.session.refreshToken,
      uid: data.user_id || this.session.uid,
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    };
    this.persistSession(refreshed);
    return refreshed.idToken;
  }

  private firestoreBase() {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.config.projectId)}/databases/(default)/documents`;
  }

  private async firestoreFetch(url: string, init: RequestInit = {}) {
    const token = await this.getIdToken();
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return readJson(await fetch(url, { ...init, headers }));
  }

  async getDocument<T = Record<string, unknown>>(path: string): Promise<FirestoreDocument<T> | null> {
    try {
      const raw = await this.firestoreFetch(`${this.firestoreBase()}/${encodePath(path)}`);
      return this.decodeDocument<T>(raw);
    } catch (error: any) {
      if (error?.status === 404) return null;
      throw error;
    }
  }

  async setDocument(path: string, data: Record<string, unknown>, options: { merge?: boolean; exists?: boolean } = {}) {
    const parts = path.split('/').filter(Boolean);
    const documentId = parts.pop();
    if (!documentId || parts.length < 1) throw new Error(`Ruta de documento inválida: ${path}`);
    const parent = parts.join('/');
    if (options.exists === false) {
      const url = `${this.firestoreBase()}/${encodePath(parent)}?documentId=${encodeURIComponent(documentId)}`;
      return this.firestoreFetch(url, { method: 'POST', body: JSON.stringify({ fields: encodeFields(data) }) });
    }
    const mask = options.merge ? Object.keys(data).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&') : '';
    const suffix = mask ? `?${mask}` : '';
    return this.firestoreFetch(`${this.firestoreBase()}/${encodePath(path)}${suffix}`, { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(data) }) });
  }

  async deleteDocument(path: string) {
    return this.firestoreFetch(`${this.firestoreBase()}/${encodePath(path)}`, { method: 'DELETE' });
  }

  async listDocuments<T = Record<string, unknown>>(collectionPath: string, pageSize = 100): Promise<FirestoreDocument<T>[]> {
    const url = `${this.firestoreBase()}/${encodePath(collectionPath)}?pageSize=${Math.min(Math.max(pageSize, 1), 300)}`;
    const raw = await this.firestoreFetch(url);
    return (raw.documents || []).map((doc: any) => this.decodeDocument<T>(doc));
  }

  async runQuery<T = Record<string, unknown>>(
    collectionId: string,
    filters: QueryFilter[] = [],
    orders: QueryOrder[] = [],
    limit = 100,
    parentPath = '',
  ): Promise<FirestoreDocument<T>[]> {
    const parent = parentPath ? `${this.firestoreBase()}/${encodePath(parentPath)}` : this.firestoreBase();
    const structuredQuery: any = { from: [{ collectionId }], limit: Math.min(Math.max(limit, 1), 300) };
    if (filters.length === 1) structuredQuery.where = this.toFieldFilter(filters[0]);
    else if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters: filters.map((filter) => this.toFieldFilter(filter)) } };
    if (orders.length) structuredQuery.orderBy = orders.map((order) => ({ field: { fieldPath: order.field }, direction: order.direction || 'ASCENDING' }));
    const raw = await this.firestoreFetch(`${parent}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
    return (raw || []).filter((row: any) => row.document).map((row: any) => this.decodeDocument<T>(row.document));
  }

  private toFieldFilter(filter: QueryFilter) {
    return { fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: encodeValue(filter.value, filter.field) } };
  }

  async commit(writes: any[]) {
    return this.firestoreFetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.config.projectId)}/databases/(default)/documents:commit`, {
      method: 'POST', body: JSON.stringify({ writes }),
    });
  }

  documentName(path: string) {
    return `projects/${this.config.projectId}/databases/(default)/documents/${path.split('/').filter(Boolean).join('/')}`;
  }

  encodeDocumentForWrite(path: string, data: Record<string, unknown>) {
    return { name: this.documentName(path), fields: encodeFields(data) };
  }

  private decodeDocument<T>(doc: any): FirestoreDocument<T> {
    const path = String(doc.name || '').split('/documents/')[1] || '';
    return {
      id: path.split('/').pop() || '',
      path,
      data: decodeFields(doc.fields || {}) as T,
      createTime: doc.createTime,
      updateTime: doc.updateTime,
    };
  }
}
