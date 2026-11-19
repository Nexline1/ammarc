// Ammarc on the phone: the live Ammarc site full-screen, plus the native parts a browser tab can't do well —
// camera/gallery for photos, the microphone, the share sheet for exports, links out to mail, and the back button.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// Baked in at build time: flutter build apk --dart-define=AMMARC_URL=https://ammarc.onrender.com
const bakedUrl = String.fromEnvironment('AMMARC_URL');
const ink = Color(0xFF16191D);
const copper = Color(0xFFCF5A1E);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.white, statusBarIconBrightness: Brightness.dark));
  runApp(MaterialApp(
    title: 'Ammarc',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(colorSchemeSeed: copper, scaffoldBackgroundColor: Colors.white),
    home: const Home(),
  ));
}

/// Opens the saved (or baked-in) address; asks for it once only if there is none.
class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  String? url;
  bool ready = false;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) => setState(() {
          url = p.getString('url') ?? (bakedUrl.isEmpty ? null : bakedUrl);
          ready = true;
        }));
  }

  Future<void> use(String? u) async {
    final p = await SharedPreferences.getInstance();
    u == null ? await p.remove('url') : await p.setString('url', u);
    setState(() => url = u ?? (bakedUrl.isEmpty ? null : bakedUrl));
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) return const Scaffold();
    if (url == null) return Setup(onDone: use);
    return Shell(key: ValueKey(url), url: url!, onChangeAddress: () => use(null).then((_) => setState(() => url = null)));
  }
}

class Setup extends StatefulWidget {
  const Setup({super.key, required this.onDone});
  final ValueChanged<String> onDone;
  @override
  State<Setup> createState() => _SetupState();
}

class _SetupState extends State<Setup> {
  final field = TextEditingController();
  String? error;

  void go() {
    var t = field.text.trim();
    if (t.isEmpty) return;
    if (!t.startsWith('http')) t = 'https://$t';
    final u = Uri.tryParse(t);
    if (u == null || u.host.isEmpty) return setState(() => error = 'That doesn\'t look like an address.');
    widget.onDone(u.toString());
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Spacer(),
              const Text('Ammarc', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -1, color: ink)),
              const SizedBox(height: 8),
              const Text('Enter the Ammarc address once. The app remembers it.', style: TextStyle(fontSize: 16, color: Color(0xFF5B636E))),
              const SizedBox(height: 24),
              TextField(
                controller: field,
                autofocus: true,
                keyboardType: TextInputType.url,
                autocorrect: false,
                onSubmitted: (_) => go(),
                decoration: InputDecoration(hintText: 'ammarc.onrender.com', errorText: error, border: const OutlineInputBorder()),
              ),
              const SizedBox(height: 16),
              SizedBox(width: double.infinity, height: 52, child: FilledButton(onPressed: go, child: const Text('Open', style: TextStyle(fontSize: 16)))),
              const Spacer(flex: 2),
            ]),
          ),
        ),
      );
}

/// Exports leave the page as <a download> clicks on blob: links, which a WebView silently drops.
/// This hands the bytes to the app instead, which opens the share sheet (WhatsApp, email, Files…).
const bridgeJs = r'''
(() => {
  if (window.__ammarcBridge) return; window.__ammarcBridge = true;
  const send = async (href, name) => {
    const blob = await (await fetch(href)).blob();
    const r = new FileReader();
    r.onload = () => AmmarcSave.postMessage(JSON.stringify({ name, data: String(r.result).split(',')[1] }));
    r.readAsDataURL(blob);
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && /^(blob|data):/.test(this.href)) { send(this.href, this.download || 'ammarc'); return; }
    return click.call(this);
  };
})();
''';

/// Back closes the open sheet first, like it would in a native app; only then does it leave.
const backJs = r'''
(() => {
  if (!document.querySelector('[role=dialog]')) return 'no';
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return 'yes';
})()
''';

class Shell extends StatefulWidget {
  const Shell({super.key, required this.url, required this.onChangeAddress});
  final String url;
  final VoidCallback onChangeAddress;
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  late final WebViewController web;
  int progress = 0;
  String? failed;

  @override
  void initState() {
    super.initState();
    final home = Uri.parse(widget.url);
    web = WebViewController(onPermissionRequest: onPermission)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..addJavaScriptChannel('AmmarcSave', onMessageReceived: (m) => share(m.message))
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => setState(() => progress = p),
        onPageStarted: (_) => setState(() => failed = null),
        onPageFinished: (_) => web.runJavaScript(bridgeJs),
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? false) setState(() => failed = e.description);
        },
        onNavigationRequest: (r) {
          final u = Uri.parse(r.url);
          final inside = u.host == home.host || const ['about', 'blob', 'data'].contains(u.scheme);
          if (inside) return NavigationDecision.navigate;
          launchUrl(u, mode: LaunchMode.externalApplication); // mailto:, other sites
          return NavigationDecision.prevent;
        },
      ));
    final android = web.platform;
    if (android is AndroidWebViewController) {
      android.setOnShowFileSelector(pickPhoto);
      android.setMediaPlaybackRequiresUserGesture(false);
    }
    web.getUserAgent().then((ua) async {
      // The site checks for "AmmarcApp" to hide what only a desktop browser can do (print to PDF).
      await web.setUserAgent('${ua ?? ''} AmmarcApp/1.0');
      await web.loadRequest(home);
    });
  }

  Future<void> onPermission(WebViewPermissionRequest req) async {
    if (req.types.contains(WebViewPermissionResourceType.microphone)) {
      final ok = await Permission.microphone.request();
      return ok.isGranted ? req.grant() : req.deny();
    }
    return req.deny();
  }

  /// The page's "upload a photo" opens a choice of camera or gallery.
  Future<List<String>> pickPhoto(FileSelectorParams params) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('Take a photo'), onTap: () => Navigator.pop(c, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Choose from photos'), onTap: () => Navigator.pop(c, ImageSource.gallery)),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (source == null) return [];
    final x = await ImagePicker().pickImage(source: source);
    return x == null ? [] : [Uri.file(x.path).toString()];
  }

  Future<void> share(String message) async {
    try {
      final m = jsonDecode(message) as Map<String, dynamic>;
      final name = (m['name'] as String).replaceAll(RegExp(r'[\\/:*?"<>|]'), ' ');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$name');
      await file.writeAsBytes(base64Decode(m['data'] as String));
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path)]));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not share the file: $e')));
    }
  }

  Future<void> back() async {
    final closed = await web.runJavaScriptReturningResult(backJs).catchError((_) => 'no');
    if (closed.toString().contains('yes')) return;
    if (await web.canGoBack()) return web.goBack();
    SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) => didPop ? null : back(),
        child: Scaffold(
          body: SafeArea(
            child: failed != null
                ? Offline(detail: failed!, onRetry: () => web.reload(), onChangeAddress: widget.onChangeAddress)
                : Stack(children: [
                    WebViewWidget(controller: web),
                    if (progress < 100) LinearProgressIndicator(value: progress / 100, minHeight: 2, color: copper, backgroundColor: Colors.transparent),
                  ]),
          ),
        ),
      );
}

class Offline extends StatelessWidget {
  const Offline({super.key, required this.detail, required this.onRetry, required this.onChangeAddress});
  final String detail;
  final VoidCallback onRetry, onChangeAddress;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Icon(Icons.wifi_off_rounded, size: 40, color: Color(0xFF5B636E)),
          const SizedBox(height: 16),
          const Text("Can't reach Ammarc", textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: ink)),
          const SizedBox(height: 8),
          Text('Check the connection and try again.\n$detail', textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF5B636E))),
          const SizedBox(height: 24),
          SizedBox(height: 52, child: FilledButton(onPressed: onRetry, child: const Text('Try again'))),
          TextButton(onPressed: onChangeAddress, child: const Text('Change address')),
        ]),
      );
}
