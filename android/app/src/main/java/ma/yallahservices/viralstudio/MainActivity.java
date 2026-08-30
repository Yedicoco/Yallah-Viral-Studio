package ma.yallahservices.viralstudio;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Thin, security-conscious Android client for the server-backed web studio.
 *
 * Video encoding, TTS, authentication and SQLite/libSQL remain on the Node
 * server. Loading that server as the WebView's top-level origin preserves its
 * HttpOnly/SameSite cookies and avoids unsafe CORS workarounds.
 */
public final class MainActivity extends Activity {
    private static final String PREFERENCES = "yallah_android";
    private static final String SERVER_URL_KEY = "server_url";
    private static final int STORAGE_PERMISSION_REQUEST = 203;
    private static final int MAX_BRIDGE_BYTES = 25 * 1024 * 1024;

    private static final int DARK = Color.rgb(7, 18, 26);
    private static final int SURFACE = Color.rgb(12, 27, 38);
    private static final int GREEN = Color.rgb(32, 201, 151);
    private static final int GOLD = Color.rgb(255, 190, 11);
    private static final int MUTED = Color.rgb(181, 198, 209);

    private final ExecutorService fileWriter = Executors.newSingleThreadExecutor();

    private SharedPreferences preferences;
    private FrameLayout content;
    private ProgressBar progress;
    private TextView serverButton;
    private WebView webView;
    private Uri trustedOrigin;
    private boolean configurationVisible = true;
    private PendingDownload pendingDownload;
    private PendingBlob pendingBlob;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences(PREFERENCES, MODE_PRIVATE);
        configureWindow();
        createShell();
        createWebView();

        String configured = preferences.getString(SERVER_URL_KEY, "");
        if ((isBlank(configured)) && !isBlank(BuildConfig.DEFAULT_SERVER_URL)) {
            configured = BuildConfig.DEFAULT_SERVER_URL;
        }
        if (isBlank(configured)) {
            showConfiguration(null, null);
        } else {
            connect(configured);
        }
    }

    private void configureWindow() {
        getWindow().setStatusBarColor(DARK);
        getWindow().setNavigationBarColor(DARK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(0);
        }
    }

    private void createShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(DARK);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(12), dp(6), dp(8), dp(6));
        toolbar.setBackgroundColor(SURFACE);
        root.addView(toolbar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

        TextView mark = new TextView(this);
        mark.setText("Y");
        mark.setTextColor(GOLD);
        mark.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        mark.setGravity(Gravity.CENTER);
        mark.setTypeface(mark.getTypeface(), android.graphics.Typeface.BOLD);
        GradientDrawable markBackground = new GradientDrawable();
        markBackground.setShape(GradientDrawable.OVAL);
        markBackground.setColor(Color.rgb(10, 92, 85));
        markBackground.setStroke(dp(1), GREEN);
        mark.setBackground(markBackground);
        mark.setContentDescription("Yallah Services");
        toolbar.addView(mark, new LinearLayout.LayoutParams(dp(40), dp(40)));

        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.setPadding(dp(10), 0, dp(8), 0);
        TextView title = new TextView(this);
        title.setText("Yallah Viral Studio");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        TextView subtitle = new TextView(this);
        subtitle.setText("Android · V" + getString(R.string.app_version));
        subtitle.setTextColor(MUTED);
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        titles.addView(title);
        titles.addView(subtitle);
        toolbar.addView(titles, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        serverButton = new TextView(this);
        serverButton.setText("Serveur ⚙");
        serverButton.setTextColor(Color.WHITE);
        serverButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        serverButton.setGravity(Gravity.CENTER);
        serverButton.setPadding(dp(12), dp(8), dp(12), dp(8));
        GradientDrawable buttonBackground = new GradientDrawable();
        buttonBackground.setColor(Color.rgb(23, 47, 61));
        buttonBackground.setCornerRadius(dp(18));
        serverButton.setBackground(buttonBackground);
        serverButton.setContentDescription("Configurer le serveur Yallah");
        serverButton.setOnClickListener(view -> confirmServerChange());
        toolbar.addView(serverButton, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(GREEN));
        progress.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(GREEN));
        progress.setVisibility(View.GONE);
        root.addView(progress, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        content = new FrameLayout(this);
        content.setBackgroundColor(DARK);
        root.addView(content, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void createWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(DARK);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString()
            + " YallahViralStudioAndroid/" + getString(R.string.app_version));

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        if (isDebugBuild()) WebView.setWebContentsDebuggingEnabled(true);
        webView.addJavascriptInterface(new DownloadBridge(), "YallahAndroid");
        webView.setDownloadListener(this::handleHttpDownload);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setIndeterminate(false);
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                progress.setIndeterminate(true);
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setIndeterminate(false);
                progress.setProgress(100);
                progress.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    CharSequence description = error.getDescription();
                    showConnectionFailure(description == null ? "Serveur inaccessible." : description.toString());
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) {
                    showConnectionFailure("Le serveur répond avec l’erreur HTTP " + response.getStatusCode() + ".");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showConnectionFailure("Certificat HTTPS invalide. La connexion a été bloquée.");
            }
        });
    }

    private void showConnectionFailure(String detail) {
        runOnUiThread(() -> {
            if (isFinishing() || configurationVisible) return;
            String message = "Connexion impossible. Vérifiez l’adresse et que le serveur est démarré.\n" + detail;
            showConfiguration(message, trustedOrigin == null ? null : trustedOrigin.toString());
        });
    }

    private void showConfiguration(String error, String attemptedUrl) {
        configurationVisible = true;
        progress.setVisibility(View.GONE);
        serverButton.setVisibility(View.INVISIBLE);
        webView.stopLoading();
        content.removeAllViews();

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_HORIZONTAL);
        panel.setPadding(dp(24), dp(34), dp(24), dp(28));
        scroll.addView(panel, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView icon = new TextView(this);
        icon.setText("Y");
        icon.setTextColor(GOLD);
        icon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 44);
        icon.setTypeface(icon.getTypeface(), android.graphics.Typeface.BOLD);
        icon.setGravity(Gravity.CENTER);
        GradientDrawable iconBackground = new GradientDrawable();
        iconBackground.setShape(GradientDrawable.OVAL);
        iconBackground.setColor(Color.rgb(10, 92, 85));
        iconBackground.setStroke(dp(2), GREEN);
        icon.setBackground(iconBackground);
        panel.addView(icon, new LinearLayout.LayoutParams(dp(82), dp(82)));

        TextView heading = text(getString(R.string.configure_title), 24, Color.WHITE, true);
        LinearLayout.LayoutParams headingParams = matchWrap();
        headingParams.topMargin = dp(22);
        panel.addView(heading, headingParams);

        TextView intro = text(getString(R.string.configure_intro), 15, MUTED, false);
        intro.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams introParams = matchWrap();
        introParams.topMargin = dp(10);
        introParams.bottomMargin = dp(22);
        panel.addView(intro, introParams);

        if (!isBlank(error)) {
            TextView errorView = text(error, 14, Color.rgb(255, 170, 170), false);
            errorView.setPadding(dp(14), dp(12), dp(14), dp(12));
            GradientDrawable errorBackground = new GradientDrawable();
            errorBackground.setColor(Color.rgb(76, 25, 30));
            errorBackground.setCornerRadius(dp(12));
            errorBackground.setStroke(dp(1), Color.rgb(170, 65, 75));
            errorView.setBackground(errorBackground);
            LinearLayout.LayoutParams errorParams = matchWrap();
            errorParams.bottomMargin = dp(14);
            panel.addView(errorView, errorParams);
        }

        EditText urlInput = new EditText(this);
        urlInput.setSingleLine(true);
        urlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        urlInput.setHint(getString(R.string.server_url_hint));
        urlInput.setHintTextColor(Color.rgb(125, 147, 160));
        urlInput.setTextColor(Color.WHITE);
        urlInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        urlInput.setPadding(dp(14), dp(12), dp(14), dp(12));
        String saved = preferences.getString(SERVER_URL_KEY, "");
        String initial = attemptedUrl != null ? attemptedUrl : saved;
        if ((isBlank(initial)) && !isBlank(BuildConfig.DEFAULT_SERVER_URL)) {
            initial = BuildConfig.DEFAULT_SERVER_URL;
        }
        if (!isBlank(initial)) urlInput.setText(initial);
        GradientDrawable inputBackground = new GradientDrawable();
        inputBackground.setColor(Color.rgb(15, 35, 47));
        inputBackground.setCornerRadius(dp(12));
        inputBackground.setStroke(dp(1), Color.rgb(49, 83, 101));
        urlInput.setBackground(inputBackground);
        panel.addView(urlInput, matchWrap());

        Button connect = new Button(this);
        connect.setText(getString(R.string.connect));
        connect.setAllCaps(false);
        connect.setTextColor(DARK);
        connect.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        connect.setTypeface(connect.getTypeface(), android.graphics.Typeface.BOLD);
        GradientDrawable connectBackground = new GradientDrawable();
        connectBackground.setColor(GREEN);
        connectBackground.setCornerRadius(dp(14));
        connect.setBackground(connectBackground);
        connect.setOnClickListener(view -> connect(urlInput.getText().toString()));
        LinearLayout.LayoutParams connectParams = matchWrap();
        connectParams.topMargin = dp(14);
        connectParams.height = dp(52);
        panel.addView(connect, connectParams);

        String securityText = isDebugBuild()
            ? "Build de test : HTTPS recommandé. Pour l’émulateur Android, utilisez http://10.0.2.2:4173."
            : "HTTPS est obligatoire. Les mots de passe restent protégés par les cookies HttpOnly du serveur.";
        TextView security = text("🔒 " + securityText, 13, MUTED, false);
        security.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams securityParams = matchWrap();
        securityParams.topMargin = dp(18);
        panel.addView(security, securityParams);

        TextView architecture = text(
            "Le moteur Node/FFmpeg doit rester déployé : l’APK est le client mobile sécurisé, pas un serveur vidéo embarqué.",
            12, Color.rgb(132, 154, 167), false);
        architecture.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams architectureParams = matchWrap();
        architectureParams.topMargin = dp(10);
        panel.addView(architecture, architectureParams);

        content.addView(scroll, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        urlInput.requestFocus();
    }

    private void connect(String rawUrl) {
        try {
            String normalized = normalizeServerUrl(rawUrl);
            trustedOrigin = Uri.parse(normalized);
            preferences.edit().putString(SERVER_URL_KEY, normalized).apply();
            configurationVisible = false;
            serverButton.setVisibility(View.VISIBLE);
            content.removeAllViews();
            content.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            progress.setIndeterminate(true);
            progress.setVisibility(View.VISIBLE);
            webView.loadUrl(normalized);
        } catch (IllegalArgumentException error) {
            showConfiguration(error.getMessage(), rawUrl == null ? null : rawUrl.trim());
        }
    }

    private String normalizeServerUrl(String rawUrl) {
        String value = rawUrl == null ? "" : rawUrl.trim();
        if (value.isEmpty()) throw new IllegalArgumentException("Saisissez l’adresse du serveur.");
        if (!value.contains("://")) value = "https://" + value;
        Uri parsed = Uri.parse(value);
        String scheme = parsed.getScheme() == null ? "" : parsed.getScheme().toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !(isDebugBuild() && "http".equals(scheme))) {
            throw new IllegalArgumentException(isDebugBuild()
                ? "Utilisez une adresse HTTPS, ou HTTP uniquement pour un serveur de développement."
                : "Cette version exige une adresse HTTPS valide.");
        }
        if (isBlank(parsed.getHost()) || parsed.getUserInfo() != null) {
            throw new IllegalArgumentException("L’adresse du serveur est invalide.");
        }
        Uri.Builder origin = new Uri.Builder()
            .scheme(scheme)
            .encodedAuthority(parsed.getEncodedAuthority())
            .path("/");
        return origin.build().toString();
    }

    private boolean handleNavigation(Uri destination) {
        if (destination == null) return true;
        if (isTrusted(destination)) return false;
        openExternal(destination);
        return true;
    }

    private boolean isTrusted(Uri destination) {
        if (trustedOrigin == null || destination.getScheme() == null || destination.getHost() == null) return false;
        return trustedOrigin.getScheme().equalsIgnoreCase(destination.getScheme())
            && trustedOrigin.getHost().equalsIgnoreCase(destination.getHost())
            && effectivePort(trustedOrigin) == effectivePort(destination);
    }

    private int effectivePort(Uri uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!("https".equals(scheme) || "http".equals(scheme)
            || "mailto".equals(scheme) || "tel".equals(scheme))) {
            Toast.makeText(this, "Lien externe bloqué.", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "Aucune application ne peut ouvrir ce lien.", Toast.LENGTH_SHORT).show();
        }
    }

    private void confirmServerChange() {
        new AlertDialog.Builder(this)
            .setTitle(getString(R.string.change_server))
            .setMessage("Changer de serveur ferme la page actuelle. Votre session reste enregistrée sur son domaine.")
            .setNegativeButton("Annuler", null)
            .setPositiveButton("Configurer", (dialog, which) ->
                showConfiguration(null, trustedOrigin == null ? null : trustedOrigin.toString()))
            .show();
    }

    private void handleHttpDownload(String url, String userAgent, String contentDisposition,
                                    String mimeType, long contentLength) {
        Uri uri = Uri.parse(url);
        if (!isTrusted(uri)) {
            openExternal(uri);
            return;
        }
        String filename = sanitizeFilename(URLUtil.guessFileName(url, contentDisposition, mimeType));
        pendingDownload = new PendingDownload(url, userAgent, mimeType, filename);
        if (needsLegacyStoragePermission()) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_PERMISSION_REQUEST);
            return;
        }
        enqueueDownload(pendingDownload);
        pendingDownload = null;
    }

    private void enqueueDownload(PendingDownload item) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(item.url));
            request.setTitle(item.filename);
            request.setDescription("Yallah Viral Studio");
            request.setMimeType(item.mimeType);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            String cookies = CookieManager.getInstance().getCookie(item.url);
            if (!isBlank(cookies)) request.addRequestHeader("Cookie", cookies);
            if (!isBlank(item.userAgent)) request.addRequestHeader("User-Agent", item.userAgent);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                "Yallah Viral Studio/" + item.filename);
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, getString(R.string.download_started), Toast.LENGTH_LONG).show();
        } catch (RuntimeException error) {
            Toast.makeText(this, "Téléchargement impossible : " + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private boolean needsLegacyStoragePermission() {
        return Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
            && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != STORAGE_PERMISSION_REQUEST) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (!granted) {
            pendingDownload = null;
            pendingBlob = null;
            Toast.makeText(this, "Autorisation de stockage refusée.", Toast.LENGTH_LONG).show();
            return;
        }
        if (pendingDownload != null) {
            enqueueDownload(pendingDownload);
            pendingDownload = null;
        }
        if (pendingBlob != null) {
            saveBlobAsync(pendingBlob);
            pendingBlob = null;
        }
    }

    private void saveBlobAsync(PendingBlob item) {
        fileWriter.execute(() -> saveBlob(item));
    }

    private void saveBlob(PendingBlob item) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, item.filename);
                values.put(MediaStore.Downloads.MIME_TYPE, item.mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/Yallah Viral Studio");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri destination = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (destination == null) throw new IllegalStateException("Stockage indisponible");
                try (OutputStream output = getContentResolver().openOutputStream(destination)) {
                    if (output == null) throw new IllegalStateException("Fichier inaccessible");
                    output.write(item.bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(destination, values, null, null);
            } else {
                File directory = new File(Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS), "Yallah Viral Studio");
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("Dossier Téléchargements inaccessible");
                }
                File destination = uniqueFile(directory, item.filename);
                try (OutputStream output = new FileOutputStream(destination)) {
                    output.write(item.bytes);
                }
            }
            runOnUiThread(() -> Toast.makeText(this,
                "Fichier enregistré dans Téléchargements/Yallah Viral Studio.", Toast.LENGTH_LONG).show());
        } catch (Exception error) {
            runOnUiThread(() -> Toast.makeText(this,
                "Enregistrement impossible : " + error.getMessage(), Toast.LENGTH_LONG).show());
        }
    }

    private File uniqueFile(File directory, String filename) {
        File candidate = new File(directory, filename);
        if (!candidate.exists()) return candidate;
        int dot = filename.lastIndexOf('.');
        String base = dot > 0 ? filename.substring(0, dot) : filename;
        String extension = dot > 0 ? filename.substring(dot) : "";
        for (int index = 2; index < 1_000; index++) {
            candidate = new File(directory, base + "-" + index + extension);
            if (!candidate.exists()) return candidate;
        }
        return new File(directory, System.currentTimeMillis() + "-" + filename);
    }

    private String sanitizeFilename(String value) {
        String cleaned = value == null ? "yallah-download" : value
            .replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-")
            .trim();
        if (cleaned.isEmpty()) cleaned = "yallah-download";
        return cleaned.length() > 120 ? cleaned.substring(cleaned.length() - 120) : cleaned;
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private boolean isDebugBuild() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setLineSpacing(0, 1.12f);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        return view;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP,
            value, getResources().getDisplayMetrics()));
    }

    @Override
    public void onBackPressed() {
        if (!configurationVisible && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.removeJavascriptInterface("YallahAndroid");
            if (content != null) content.removeView(webView);
            webView.destroy();
        }
        fileWriter.shutdownNow();
        super.onDestroy();
    }

    private final class DownloadBridge {
        @JavascriptInterface
        public void saveBase64(String filename, String mimeType, String encoded) {
            if (configurationVisible || trustedOrigin == null || encoded == null) return;
            if (encoded.length() > (MAX_BRIDGE_BYTES * 4L / 3L) + 16) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    "Fichier trop volumineux pour l’export mobile.", Toast.LENGTH_LONG).show());
                return;
            }
            try {
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                if (bytes.length > MAX_BRIDGE_BYTES) throw new IllegalArgumentException("Fichier trop volumineux");
                PendingBlob item = new PendingBlob(sanitizeFilename(filename),
                    isBlank(mimeType) ? "application/octet-stream" : mimeType, bytes);
                runOnUiThread(() -> {
                    if (needsLegacyStoragePermission()) {
                        pendingBlob = item;
                        requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                            STORAGE_PERMISSION_REQUEST);
                    } else {
                        saveBlobAsync(item);
                    }
                });
            } catch (IllegalArgumentException error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    "Données d’export invalides.", Toast.LENGTH_LONG).show());
            }
        }
    }

    private static final class PendingDownload {
        final String url;
        final String userAgent;
        final String mimeType;
        final String filename;

        PendingDownload(String url, String userAgent, String mimeType, String filename) {
            this.url = url;
            this.userAgent = userAgent;
            this.mimeType = mimeType == null ? "application/octet-stream" : mimeType;
            this.filename = filename;
        }
    }

    private static final class PendingBlob {
        final String filename;
        final String mimeType;
        final byte[] bytes;

        PendingBlob(String filename, String mimeType, byte[] bytes) {
            this.filename = filename;
            this.mimeType = mimeType;
            this.bytes = bytes;
        }
    }
}
