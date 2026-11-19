// Talks to the same Ammarc server as the website. On the web (iPhone home-screen app) it is served by that
// server, so it uses its own origin and the browser keeps the sign-in cookie; on Android it keeps the cookie itself.
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const _baked = String.fromEnvironment('AMMARC_URL', defaultValue: 'https://ammarc-d68t.onrender.com');

class AuthError implements Exception {
  @override
  String toString() => 'Sign in first';
}

class ApiError implements Exception {
  ApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

class Api {
  Api._();
  static final Api i = Api._();

  final String base = kIsWeb ? Uri.base.origin : _baked;
  final _http = http.Client();
  String? _cookie;
  VoidCallback? onAuth;

  Future<void> init() async {
    if (!kIsWeb) _cookie = (await SharedPreferences.getInstance()).getString('cookie');
  }

  Uri u(String path) => Uri.parse('$base$path');
  String fileUrl(String file) => '$base/files/$file';
  String abs(String url) => url.startsWith('http') ? url : '$base$url';
  Map<String, String> get cookie => _cookie == null ? {} : {'Cookie': _cookie!};
  Map<String, String> _headers({bool json = true}) => {if (json) 'Content-Type': 'application/json', ...cookie};

  dynamic _parse(int status, Uint8List bytes) {
    if (status == 401) {
      onAuth?.call();
      throw AuthError();
    }
    dynamic data;
    try {
      data = bytes.isEmpty ? null : jsonDecode(utf8.decode(bytes));
    } catch (_) {}
    if (status >= 400) throw ApiError((data is Map ? data['error'] as String? : null) ?? 'Request failed ($status)');
    return data;
  }

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final req = http.Request(method, u(path))..headers.addAll(_headers(json: body != null));
    if (body != null) req.body = jsonEncode(body);
    final res = await http.Response.fromStream(await _http.send(req));
    return _parse(res.statusCode, res.bodyBytes);
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, Object body) => _send('POST', path, body);
  Future<dynamic> put(String path, Object body) => _send('PUT', path, body);

  Future<Uint8List> bytes(String url) async {
    final res = await _http.get(Uri.parse(abs(url)), headers: cookie);
    if (res.statusCode == 401) {
      onAuth?.call();
      throw AuthError();
    }
    if (res.statusCode >= 400) throw ApiError('Image failed to load (${res.statusCode})');
    return res.bodyBytes;
  }

  Future<bool> login(String password) async {
    final res = await _http.post(u('/api/login'), headers: _headers(), body: jsonEncode({'password': password}));
    if (res.statusCode == 429) throw ApiError(jsonDecode(res.body)['error'] as String);
    if (res.statusCode != 200) return false;
    final m = RegExp(r'arm=([a-f0-9]{64})').firstMatch(res.headers['set-cookie'] ?? '');
    if (!kIsWeb && m != null) {
      _cookie = 'arm=${m[1]}';
      await (await SharedPreferences.getInstance()).setString('cookie', _cookie!);
    }
    return true;
  }

  Future<String> upload(Uint8List png) async => (await post('/api/files', {'dataUrl': 'data:image/png;base64,${base64Encode(png)}'}))['file'] as String;

  /// /api/render sends server-sent events: partial previews, then the final image.
  Stream<Map<String, dynamic>> render(Map<String, dynamic> body) async* {
    final req = http.Request('POST', u('/api/render'))
      ..headers.addAll(_headers())
      ..body = jsonEncode(body);
    final res = await _http.send(req);
    if (res.statusCode >= 400) _parse(res.statusCode, await res.stream.toBytes());
    var buf = '';
    await for (final chunk in res.stream.transform(utf8.decoder)) {
      buf += chunk;
      int cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        final line = buf.substring(0, cut).trim();
        buf = buf.substring(cut + 2);
        if (line.startsWith('data: ')) yield jsonDecode(line.substring(6)) as Map<String, dynamic>;
      }
    }
  }

  Future<String> transcribe(Uint8List audio, String mime, String lang) async {
    final res = await _http.post(u('/api/transcribe?lang=$lang'), headers: {'Content-Type': mime, ...cookie}, body: audio);
    return (_parse(res.statusCode, res.bodyBytes) as Map)['text'] as String;
  }
}
