import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const packageName = String(config.appId || '').trim();
if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(packageName)) {
  console.error('DETENIDO: appId inválido para plugin seguro.');
  process.exit(2);
}

const javaDir = path.join(root, 'android/app/src/main/java', ...packageName.split('.'));
const mainActivityPath = path.join(javaDir, 'MainActivity.java');
if (!fs.existsSync(mainActivityPath)) {
  console.error(`DETENIDO: MainActivity.java no encontrado en ${mainActivityPath}`);
  process.exit(2);
}

const pluginPath = path.join(javaDir, 'TuTopSecureStorePlugin.java');
const pluginSource = `package ${packageName};

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "TuTopSecureStore")
public class TuTopSecureStorePlugin extends Plugin {
    private static final String PREFS = "tutop_secure_store_v1";
    private static final String KEY_ALIAS = "tutop_session_aes_gcm_v1";
    private static final String CIPHER = "AES/GCM/NoPadding";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private String decrypt(String payload) throws Exception {
        String[] parts = payload.split("\\\\.", 2);
        if (parts.length != 2) throw new IllegalArgumentException("INVALID_SECURE_PAYLOAD");
        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.length() < 3 || value == null) {
            call.reject("INVALID_ARGUMENT");
            return;
        }
        try {
            prefs().edit().putString(key, encrypt(value)).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("SECURE_STORE_WRITE_FAILED", error);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.length() < 3) {
            call.reject("INVALID_ARGUMENT");
            return;
        }
        String encrypted = prefs().getString(key, null);
        JSObject result = new JSObject();
        if (encrypted == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            result.put("value", decrypt(encrypted));
            call.resolve(result);
        } catch (Exception error) {
            // Corrupt/invalid ciphertext is removed fail-closed rather than returned.
            prefs().edit().remove(key).apply();
            call.reject("SECURE_STORE_READ_FAILED", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.length() < 3) {
            call.reject("INVALID_ARGUMENT");
            return;
        }
        prefs().edit().remove(key).apply();
        call.resolve();
    }
}
`;
fs.writeFileSync(pluginPath, pluginSource);

let activity = fs.readFileSync(mainActivityPath, 'utf8');
if (!activity.includes('import android.os.Bundle;')) {
  const packageLine = `package ${packageName};`;
  if (!activity.includes(packageLine)) {
    console.error('DETENIDO: package de MainActivity no coincide con appId.');
    process.exit(2);
  }
  activity = activity.replace(packageLine, `${packageLine}\n\nimport android.os.Bundle;`);
}

if (!activity.includes('registerPlugin(TuTopSecureStorePlugin.class)')) {
  const emptyClass = /public class MainActivity extends BridgeActivity\s*\{\s*\}/m;
  if (emptyClass.test(activity)) {
    activity = activity.replace(emptyClass, `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TuTopSecureStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}`);
  } else if (/void onCreate\s*\(Bundle savedInstanceState\)/.test(activity)) {
    activity = activity.replace(
      /void onCreate\s*\(Bundle savedInstanceState\)\s*\{/,
      (match) => `${match}\n        registerPlugin(TuTopSecureStorePlugin.class);`,
    );
  } else {
    console.error('DETENIDO: MainActivity tiene una forma no reconocida; no inyecto secure store a ciegas.');
    process.exit(2);
  }
}

fs.writeFileSync(mainActivityPath, activity);
console.log(`✅ TuTopSecureStore Android generado y registrado para ${packageName}. AES-GCM key permanece en AndroidKeyStore.`);
