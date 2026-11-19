// Ammarc, native: the same server and the same loop as the website, with its own screens, gestures and drawing.
// Builds for Android (APK) and for the web, where the iPhone adds it to the home screen.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'raster.dart' show ink;
import 'state.dart';
import 'studio.dart';

const copper = Color(0xFFCF5A1E);
const muted = Color(0xFF5B636E);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent, statusBarIconBrightness: Brightness.dark));
  AppState.i.boot();
  runApp(const AmmarcApp());
}

class AmmarcApp extends StatelessWidget {
  const AmmarcApp({super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: AppState.i,
        builder: (context, _) {
          final s = AppState.i;
          return MaterialApp(
            title: 'Ammarc',
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              colorScheme: ColorScheme.fromSeed(seedColor: copper, primary: copper, surface: Colors.white),
              scaffoldBackgroundColor: const Color(0xFFF3F4F6),
              fontFamilyFallback: const ['IBM Plex Sans Arabic', 'Noto Sans Arabic'],
              splashFactory: InkSparkle.splashFactory,
            ),
            builder: (context, child) => Directionality(textDirection: s.lang == 'ar' ? TextDirection.rtl : TextDirection.ltr, child: child!),
            home: s.authed == null ? const _Splash() : (s.authed! ? const Studio() : const Login()),
          );
        },
      );
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Wordmark(size: 28)));
}

class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 18});
  final double size;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, textDirection: TextDirection.ltr, children: [
        Container(
          width: size * 1.4, height: size * 1.4,
          decoration: BoxDecoration(color: ink, borderRadius: BorderRadius.circular(size * 0.35)),
          alignment: Alignment.center,
          child: Text('A', style: TextStyle(color: const Color(0xFFE8743A), fontWeight: FontWeight.w800, fontSize: size)),
        ),
        SizedBox(width: size * 0.45),
        Text('Ammarc', style: TextStyle(fontSize: size, fontWeight: FontWeight.w800, letterSpacing: -0.02 * size, color: ink)),
      ]);
}

class Login extends StatefulWidget {
  const Login({super.key});
  @override
  State<Login> createState() => _LoginState();
}

class _LoginState extends State<Login> {
  final pw = TextEditingController();
  String? error;
  bool busy = false;

  Future<void> go() async {
    if (busy || pw.text.isEmpty) return;
    setState(() => busy = true);
    try {
      if (!await AppState.i.login(pw.text)) setState(() => error = AppState.i.t('wrong'));
    } catch (e) {
      setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppState.i.t;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 380),
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24), boxShadow: const [BoxShadow(color: Color(0x1A2A2F36), blurRadius: 40, offset: Offset(0, 16))]),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                const Align(alignment: AlignmentDirectional.centerStart, child: Wordmark(size: 22)),
                const SizedBox(height: 8),
                Text(t('tagline'), style: const TextStyle(color: muted)),
                const SizedBox(height: 22),
                TextField(
                  controller: pw,
                  obscureText: true,
                  autofocus: true,
                  onSubmitted: (_) => go(),
                  decoration: InputDecoration(labelText: t('password'), errorText: error, border: const OutlineInputBorder()),
                ),
                const SizedBox(height: 16),
                SizedBox(height: 52, child: FilledButton(onPressed: busy ? null : go, child: busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(t('signIn')))),
                const SizedBox(height: 8),
                TextButton(onPressed: () => AppState.i.setLang(AppState.i.lang == 'en' ? 'ar' : 'en'), child: Text(t('language'))),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
