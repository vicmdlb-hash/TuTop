import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const packageName = String(config.appId || '').trim();
if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(packageName)) {
  console.error('DETENIDO: appId inválido para Topi AI.');
  process.exit(2);
}

const javaDir = path.join(root, 'android/app/src/main/java', ...packageName.split('.'));
const mainActivityPath = path.join(javaDir, 'MainActivity.java');
const appGradlePath = path.join(root, 'android/app/build.gradle');
if (!fs.existsSync(mainActivityPath) || !fs.existsSync(appGradlePath)) {
  console.error('DETENIDO: proyecto Android incompleto para Topi AI.');
  process.exit(2);
}

const pluginPath = path.join(javaDir, 'TuTopAIPlugin.java');
const pluginSource = `package ${packageName};

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.firebase.ai.FirebaseAI;
import com.google.firebase.ai.GenerativeModel;
import com.google.firebase.ai.java.GenerativeModelFutures;
import com.google.firebase.ai.type.Content;
import com.google.firebase.ai.type.GenerateContentResponse;
import com.google.firebase.ai.type.GenerativeBackend;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TuTopAI")
public class TuTopAIPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private boolean modelAllowed(String model) {
        return "gemini-3.8-flash".equals(model) || "gemini-3.5-flash-lite".equals(model);
    }

    private Exception asException(Throwable error) {
        return error instanceof Exception ? (Exception) error : new Exception(error);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject payload = new JSObject();
        payload.put("provider", "firebase-ai-logic");
        payload.put("sdk", "firebase-ai-17.17.0");
        payload.put("ready", true);
        call.resolve(payload);
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String prompt = call.getString("prompt", "").trim();
        String requestedModel = call.getString("model", "gemini-3.8-flash").trim();
        if (prompt.length() < 3 || prompt.length() > 6000) {
            call.reject("TOPI_AI_PROMPT_INVALID");
            return;
        }
        if (!modelAllowed(requestedModel)) {
            call.reject("TOPI_AI_MODEL_NOT_ALLOWED");
            return;
        }

        try {
            GenerativeModel ai = FirebaseAI.getInstance(GenerativeBackend.googleAI())
                    .generativeModel(requestedModel);
            GenerativeModelFutures model = GenerativeModelFutures.from(ai);
            Content content = new Content.Builder().addText(prompt).build();
            ListenableFuture<GenerateContentResponse> response = model.generateContent(content);
            Futures.addCallback(response, new FutureCallback<GenerateContentResponse>() {
                @Override
                public void onSuccess(GenerateContentResponse result) {
                    String text = result == null ? "" : result.getText();
                    if (text == null || text.trim().isEmpty()) {
                        call.reject("TOPI_AI_EMPTY_RESPONSE");
                        return;
                    }
                    JSObject payload = new JSObject();
                    payload.put("text", text);
                    payload.put("model", requestedModel);
                    payload.put("provider", "firebase-ai-logic");
                    payload.put("sdk", "firebase-ai-17.17.0");
                    call.resolve(payload);
                }

                @Override
                public void onFailure(Throwable error) {
                    call.reject("TOPI_AI_REQUEST_FAILED", asException(error));
                }
            }, executor);
        } catch (Throwable error) {
            call.reject("TOPI_AI_UNAVAILABLE", asException(error));
        }
    }
}
`;
fs.writeFileSync(pluginPath, pluginSource);

let gradle = fs.readFileSync(appGradlePath, 'utf8');
// Generated Android trees can be prepared more than once in CI/dev. Keep one
// authoritative Firebase AI version instead of accumulating old declarations.
gradle = gradle.replace(/^\s*implementation\s+["']com\.google\.firebase:firebase-ai:[^"']+["']\s*$/gm, '');
const dependencies = [
  'implementation "com.google.firebase:firebase-ai:17.17.0"',
  'implementation "com.google.guava:guava:31.0.1-android"',
];
for (const dependency of dependencies) {
  if (gradle.includes(dependency)) continue;
  const marker = 'dependencies {';
  const index = gradle.indexOf(marker);
  if (index < 0) {
    console.error('DETENIDO: dependencies { no encontrado en build.gradle.');
    process.exit(2);
  }
  const insertAt = index + marker.length;
  gradle = `${gradle.slice(0, insertAt)}\n    ${dependency}${gradle.slice(insertAt)}`;
}
fs.writeFileSync(appGradlePath, gradle);

let activity = fs.readFileSync(mainActivityPath, 'utf8');
if (!activity.includes('registerPlugin(TuTopAIPlugin.class)')) {
  const onCreate = /void onCreate\s*\(Bundle savedInstanceState\)\s*\{/;
  if (!onCreate.test(activity)) {
    console.error('DETENIDO: MainActivity no tiene onCreate compatible para Topi AI.');
    process.exit(2);
  }
  activity = activity.replace(onCreate, (match) => `${match}\n        registerPlugin(TuTopAIPlugin.class);`);
  fs.writeFileSync(mainActivityPath, activity);
}

console.log('✅ TuTopAI Android generado: Firebase AI Logic 17.17.0 + Gemini Flash, sin API key de proveedor en el cliente.');
