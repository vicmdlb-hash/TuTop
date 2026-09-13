import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const packageName = String(config.appId || '').trim();
if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(packageName)) {
  console.error('DETENIDO: appId inválido para Topi Voice.');
  process.exit(2);
}

const javaDir = path.join(root, 'android/app/src/main/java', ...packageName.split('.'));
const mainActivityPath = path.join(javaDir, 'MainActivity.java');
if (!fs.existsSync(mainActivityPath)) {
  console.error('DETENIDO: MainActivity.java no existe para Topi Voice.');
  process.exit(2);
}

const pluginPath = path.join(javaDir, 'TuTopVoicePlugin.java');
const source = `package ${packageName};

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

@CapacitorPlugin(
    name = "TuTopVoice",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class TuTopVoicePlugin extends Plugin {
    private static final int MAX_RECOGNITION_ATTEMPTS = 2;
    private SpeechRecognizer recognizer;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private String state() {
        return getPermissionState("microphone") == PermissionState.GRANTED ? "granted" :
            getPermissionState("microphone") == PermissionState.DENIED ? "denied" : "prompt";
    }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", state());
        result.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        resolvePermission(call);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolvePermission(call);
            return;
        }
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        resolvePermission(call);
    }

    private void resolveText(PluginCall call, String text, boolean partialFallback) {
        String clean = text == null ? "" : text.trim();
        stopRecognizer();
        if (clean.isEmpty()) {
            call.reject("TOPI_VOICE_EMPTY");
            return;
        }
        JSObject payload = new JSObject();
        payload.put("text", clean);
        payload.put("partialFallback", partialFallback);
        call.resolve(payload);
    }

    private boolean recoverableRecognitionError(int error) {
        return error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY;
    }

    private void startRecognitionSession(PluginCall call, String language, int attempt) {
        stopRecognizer();
        final String[] bestPartial = { "" };
        recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onEvent(int eventType, Bundle params) {}

            @Override public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults == null ? null : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty() && matches.get(0) != null && !matches.get(0).trim().isEmpty()) {
                    bestPartial[0] = matches.get(0).trim();
                }
            }

            @Override public void onError(int error) {
                if ((error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) && !bestPartial[0].isEmpty()) {
                    resolveText(call, bestPartial[0], true);
                    return;
                }
                if (recoverableRecognitionError(error) && attempt + 1 < MAX_RECOGNITION_ATTEMPTS) {
                    stopRecognizer();
                    mainHandler.postDelayed(() -> startRecognitionSession(call, language, attempt + 1), 300L);
                    return;
                }
                stopRecognizer();
                call.reject("TOPI_VOICE_RECOGNITION_ERROR_" + error);
            }

            @Override public void onResults(Bundle results) {
                ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String text = matches == null || matches.isEmpty() ? bestPartial[0] : matches.get(0);
                resolveText(call, text, matches == null || matches.isEmpty());
            }
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 900L);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L);
        recognizer.startListening(intent);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("TOPI_VOICE_PERMISSION_REQUIRED");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("TOPI_VOICE_UNAVAILABLE");
            return;
        }
        final String language = call.getString("language", "es-MX");
        getActivity().runOnUiThread(() -> {
            try {
                startRecognitionSession(call, language, 0);
            } catch (Throwable error) {
                stopRecognizer();
                call.reject("TOPI_VOICE_START_FAILED", error instanceof Exception ? (Exception) error : new Exception(error));
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopRecognizer();
            call.resolve();
        });
    }

    private void stopRecognizer() {
        if (recognizer == null) return;
        try { recognizer.stopListening(); } catch (Throwable ignored) {}
        try { recognizer.cancel(); } catch (Throwable ignored) {}
        try { recognizer.destroy(); } catch (Throwable ignored) {}
        recognizer = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopRecognizer();
        super.handleOnDestroy();
    }
}
`;
fs.writeFileSync(pluginPath, source);

let activity = fs.readFileSync(mainActivityPath, 'utf8');
if (!activity.includes('registerPlugin(TuTopVoicePlugin.class)')) {
  const onCreate = /void onCreate\s*\(Bundle savedInstanceState\)\s*\{/;
  if (!onCreate.test(activity)) {
    console.error('DETENIDO: MainActivity no tiene onCreate compatible para Topi Voice.');
    process.exit(2);
  }
  activity = activity.replace(onCreate, (match) => `${match}\n        registerPlugin(TuTopVoicePlugin.class);`);
  fs.writeFileSync(mainActivityPath, activity);
}

console.log('✅ TuTopVoice Android generado: RECORD_AUDIO bajo demanda + es-MX + parciales + tolerancia de silencio + un reintento seguro.');
