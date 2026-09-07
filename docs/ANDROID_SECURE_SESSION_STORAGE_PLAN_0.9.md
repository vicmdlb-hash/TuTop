# TuTop 0.9 — migración de sesión Android a almacenamiento seguro

## Estado

**DISEÑADO / NO IMPLEMENTADO TODAVÍA.** La beta actual mantiene deuda conocida en almacenamiento WebView/localStorage. Este documento evita sustituirla por una falsa mejora basada sólo en SharedPreferences.

## Objetivo

En Android, refresh/access credentials deben salir del almacenamiento WebView y quedar protegidas por una capa nativa respaldada por Android Keystore. Web mantiene su estrategia separada.

## Requisitos mínimos

- clave criptográfica generada dentro de Android Keystore;
- material de clave no exportable;
- cifrado autenticado (por ejemplo AES-GCM) para el payload persistido;
- namespace por Firebase `projectId`;
- lectura/escritura/borrado a través de un bridge Capacitor mínimo;
- cero tokens en logs, analytics, crash reports o errores visibles;
- borrado atómico en logout y fallo terminal;
- migración one-shot desde la sesión legacy y borrado posterior de la copia legacy;
- comportamiento fail-closed si descifrado/integridad falla.

## Contrato propuesto del bridge

`SecureSessionStore`:

- `get({ projectId }) -> { session | null }`
- `set({ projectId, session })`
- `remove({ projectId })`
- `migrateLegacy({ projectId, legacySession }) -> { migrated: boolean }`

El bridge no expone claves criptográficas ni hardware IDs a JavaScript.

## Payload permitido

Sólo los datos estrictamente necesarios para reanudar Firebase Auth:

- `uid`;
- `idToken` si la arquitectura actual lo requiere;
- `refreshToken`;
- `expiresAt`;
- `projectId`;
- versión de schema.

No mezclar perfil, chats, teléfonos, OTP, App Check token ni datos de marketplace en el mismo secreto.

## Migración segura

### Fase 1 — bridge sin activar

- implementar plugin nativo y tests unitarios Android;
- mantener lectura actual de sesión;
- comprobar que Web no importa código Android.

### Fase 2 — shadow migration

En arranque Android:

1. consultar secure store;
2. si existe sesión válida, usarla;
3. si no existe y hay sesión legacy, validar estructura/projectId;
4. escribirla cifrada en secure store;
5. releer y comprobar igualdad semántica;
6. sólo entonces borrar legacy localStorage;
7. si cualquier paso falla, no duplicar ni sobrescribir una sesión más nueva.

### Fase 3 — secure-first

- Android deja de persistir nuevos refresh tokens en localStorage;
- logout borra secure store + cualquier residuo legacy;
- terminal auth failure borra secure store;
- errores transitorios preservan sesión para retry seguro.

### Fase 4 — retirar compatibilidad legacy

Sólo después de una versión completa de migración y Physical QA.

## Invariantes de concurrencia

- latest login wins;
- un refresh iniciado con sesión A nunca puede sobrescribir sesión B;
- logout invalida cualquier escritura async pendiente;
- `projectId` diferente nunca comparte secreto;
- reinstall debe producir el comportamiento esperado de Android app data; no se debe asumir persistencia fuera del sandbox.

## Tests obligatorios

- set/get/remove;
- ciphertext corrupto -> fail closed;
- project mismatch;
- migración legacy exitosa;
- fallo de escritura no borra legacy antes de tiempo;
- doble migración idempotente;
- login A -> login B mientras refresh A está pendiente;
- logout durante refresh;
- refresh terminal limpia secreto;
- refresh transitorio conserva secreto;
- no token en logs;
- reinstalación/cold-start físicos.

## Decisión de implementación

No usar `@capacitor/preferences` como solución de seguridad: por sí sola no proporciona el objetivo de cifrado respaldado por Keystore. Se puede usar Preferences únicamente para metadata no secreta.

## Gate para activar

No promover a producción hasta:

1. plugin/bridge implementado;
2. tests Android verdes;
3. no regresión Web;
4. Physical QA cold-start/logout/reinstall A+B;
5. revisión de que ningún token crudo quedó en localStorage después de migrar.
