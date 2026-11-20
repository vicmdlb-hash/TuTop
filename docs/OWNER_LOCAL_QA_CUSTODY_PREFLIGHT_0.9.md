# TuTop — inspección privada de custodia QA (sin APK, sin claves en el chat)

**Estado:** procedimiento de diagnóstico, no construye ni firma una APK y no concede autorización de instalación.

La prioridad es comprobar si los materiales QA de 16NOV están accesibles en la PC propietaria. La firma QA pública está reconciliada con el registro R88, pero el código actual no tiene APK firmada.

## Opción rápida: Windows PowerShell (sin repositorio)
Abre Windows PowerShell y pega **solo** este código. Comprueba metadatos de tres archivos concretos: archivo ordinario, tamaño mayor a cero y ausencia de enlace simbólico/reparse point. No lee contenido, descifra, mueve ni modifica ningún archivo; los errores se traducen a `false` sin revelar rutas. La presencia no demuestra que el certificado o la clave sean válidos.

```powershell
$base = Join-Path $env:USERPROFILE 'TuTop-Private\keys'
function Test-OwnerQaFile([string]$Name) {
  try {
    $item = Get-Item -LiteralPath (Join-Path $base $Name) -Force -ErrorAction Stop
    if (-not ($item -is [System.IO.FileInfo])) { return $false }
    return [bool](($item.Length -gt 0) -and (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0))
  } catch { return $false }
}
[pscustomobject]@{
  P12 = Test-OwnerQaFile 'TuTop-QA-ONLY-20261116.p12'
  AGE = Test-OwnerQaFile 'TuTop-age-identity-OWNER-ONLY-20261116.txt'
  RECOVERY = Test-OwnerQaFile 'RECOVERY_SECRET_LOCAL_ONLY_20261116.txt'
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

## Guardia de custodia: ruta local permitida y workflow remoto en HOLD

Al corte del 19NOV2026 CDMX, el workflow `.github/workflows/tutop-private-qa-encrypted-apk.yml` exige `secrets.TUTOP_QA_JKS_BASE64`, `TUTOP_QA_JKS_PASSWORD`, `TUTOP_QA_KEY_ALIAS` y `TUTOP_QA_KEY_PASSWORD` en GitHub para ejecutar su firma y cifrado. **No es la ruta autorizada para una clave QA bajo custodia exclusiva de la PC propietaria.** No subir archivos P12/JKS, contraseñas, identidades age ni secretos de recuperación a GitHub; no cambiar `ops/private-qa-apk.trigger` para activarlo. Las dos CI de fuente/emulador por sí solas no crean una APK privada descargable.

La alternativa fuente ya existente es `scripts/local-private-qa-sign-encrypt.mjs` (ejecución **únicamente por el titular en su máquina**, después de verificar insumos y autorizar ese paso concreto). Exige HEAD de Git limpio e idéntico al candidato, APK de entrada auténtica del mismo código con paquete/version correctos, manifiesto público de firma, PKCS12/JKS QA local, identidad age local, utilidades Java/apksigner/aapt2/age y reconocimiento explícito `TUTOP_LOCAL_QA_ACK`. Comprueba el certificado SHA-256, cifra el APK con la clave pública age, recupera el cifrado localmente para verificar SHA-256 y se niega a sobreescribir artefactos anteriores. No genera la APK de entrada ni acredita la identidad criptográfica solo por detectar archivos presentes.

**Compatibilidad pendiente:** los flujos actuales esperan Android `versionCode 90200`, inferior al Build121 histórico `90215`. Antes de instalar, comprobar en el dispositivo versión y certificado existentes. No forzar downgrade, no desinstalar, no borrar datos. La elección de versionCode/signer para la próxima QA es un gate separado, no resuelto por este diagnóstico.

**Estado de esta nota:** advertencia de seguridad de proceso, no firma, no restauración, no generación de APK, no despliegue, no autorización R6. Fuente: `.github/workflows/tutop-private-qa-encrypted-apk.yml`, `scripts/local-private-qa-sign-encrypt.mjs`; PR #123 en borrador.
