# TuTop — inspección privada de custodia QA (sin APK, sin claves en el chat)

**Estado:** procedimiento de diagnóstico, no construye ni firma una APK y no concede autorización de instalación.

La prioridad es comprobar si los materiales QA de 16NOV están accesibles en la PC propietaria. La firma QA pública está reconciliada con el registro R88, pero el código actual no tiene APK firmada.

## Opción rápida: Windows PowerShell (sin repositorio)
Abre Windows PowerShell y pega **solo** este código. Usa `Test-Path`: no abre, descifra, mueve ni modifica ningún archivo.

```powershell
$base = Join-Path $env:USERPROFILE 'TuTop-Private\keys'
[pscustomobject]@{
  P12 = Test-Path -LiteralPath (Join-Path $base 'TuTop-QA-ONLY-20261116.p12') -PathType Leaf
  AGE = Test-Path -LiteralPath (Join-Path $base 'TuTop-age-identity-OWNER-ONLY-20261116.txt') -PathType Leaf
  RECOVERY = Test-Path -LiteralPath (Join-Path $base 'RECOVERY_SECRET_LOCAL_ONLY_20261116.txt') -PathType Leaf
} | ConvertTo-Json -Compress
```

**Contesta únicamente los tres valores true/false.** No envíes contenido, contraseñas, claves privadas, JKS, rutas particulares ni capturas de pantalla de esa carpeta.

## Opción si ya tienes el repositorio local
Dentro del directorio TuTop, ejecuta `node scripts/owner-local-qa-custody-preflight.mjs`. Imprime solo tres valores booleanos de archivos, estado de plataforma y garantías explícitas de que no hay APK probada ni permiso para restaurar/firmar. No lee contenidos; trata directorios, accesos simbólicos, rutas vacías y archivos de tamaño cero como ausentes.

## Próximos bloqueos
- Si P12 y AGE son true: aún falta comprobar disponibilidad de Node/Java/Android SDK y generar una APK exactamente desde el HEAD vigente con configuración staging legítima. No basta con las dos CI de código.
- Si falta algún archivo, pero RECOVERY es true, sigue únicamente las instrucciones originales de recuperación bajo custodia local. No ejecutes una restauración automáticamente.
- Si RECOVERY es false y faltan las claves, el respaldo cifrado en Drive no permite su recuperación por sí solo.
- Antes de instalar: confirmar por lectura si el teléfono ya tiene TuTop, versionCode y certificado. No desinstalar, forzar downgrade, limpiar datos ni publicar.

Fuente original de recuperación: https://docs.google.com/document/d/1VwF5GEdHZ-CyxIwlTmbljbHDBIoKXpr7/edit
Repositorio: https://github.com/vicmdlb-hash/TuTop/pull/123
