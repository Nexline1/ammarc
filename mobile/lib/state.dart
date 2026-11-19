// One app-wide state, like the web app's store: the open idea, undo/redo, the busy stage, autosave.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'i18n.dart';
import 'models.dart';

enum Tool { select, pen, point, arrow, text, eraser }

final _rand = math.Random.secure();
String uid([int n = 12]) => List.generate(n, (_) => '0123456789abcdef'[_rand.nextInt(16)]).join();
String uuid() {
  final h = uid(32);
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-4${h.substring(13, 16)}-${'89ab'[_rand.nextInt(4)]}${h.substring(17, 20)}-${h.substring(20)}';
}

class AppState extends ChangeNotifier {
  AppState._();
  static final AppState i = AppState._();

  String lang = 'en';
  bool? authed; // null = still checking
  bool demo = false;
  Project? project;
  List<ProjectSummary> projects = [];
  String? busy; // what the app is doing right now, in his language
  Uint8List? preview; // a render streaming in
  Tool tool = Tool.select;
  String? selected; // element or mark uid
  String? hint; // "Tap where" and friends
  String? awaiting; // the sentence to re-send once he taps where
  String draft = '';
  String? toast;
  final List<String> _past = [], _future = [];
  Timer? _save;

  String t(String key) => tr(lang, key);
  bool get canUndo => _past.isNotEmpty && busy == null;
  bool get canRedo => _future.isNotEmpty && busy == null;

  void update([VoidCallback? fn]) {
    fn?.call();
    notifyListeners();
  }

  void say(String text) {
    toast = text;
    notifyListeners();
  }

  Future<void> setLang(String l) async {
    lang = l;
    notifyListeners();
    (await SharedPreferences.getInstance()).setString('lang', l);
  }

  Future<void> boot() async {
    final prefs = await SharedPreferences.getInstance();
    lang = prefs.getString('lang') ?? (PlatformDispatcher.instance.locale.languageCode == 'ar' ? 'ar' : 'en');
    await Api.i.init();
    Api.i.onAuth = () => update(() => authed = false);
    try {
      final st = await Api.i.get('/api/status') as Map;
      demo = st['mock'] == true;
      authed = st['auth'] != true || st['authed'] == true || await _probe();
      notifyListeners();
      if (authed!) await openLast();
    } catch (e) {
      say('${t('offline')} ($e)');
      authed = false;
      notifyListeners();
    }
  }

  // Native apps keep their own cookie, which /api/status (a cookie-less check on some platforms) can't see.
  Future<bool> _probe() async {
    try {
      await Api.i.get('/api/projects');
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> login(String pw) async {
    final ok = await Api.i.login(pw);
    if (ok) {
      authed = true;
      notifyListeners();
      await openLast();
    }
    return ok;
  }

  Future<void> refreshProjects() async {
    projects = [for (final p in await Api.i.get('/api/projects') as List) ProjectSummary.fromJson(p)];
    notifyListeners();
  }

  Future<void> openLast() async {
    await refreshProjects();
    final last = (await SharedPreferences.getInstance()).getString('project');
    final id = projects.where((p) => p.id == last).firstOrNull?.id ?? projects.firstOrNull?.id;
    open(id == null ? newProject() : Project.fromJson(await Api.i.get('/api/projects/$id')));
  }

  Project newProject([String? name]) => Project(id: uuid(), name: name ?? t('untitled'), updatedAt: DateTime.now().millisecondsSinceEpoch);

  Future<void> openId(String id) async => open(Project.fromJson(await Api.i.get('/api/projects/$id')));

  void open(Project p) {
    if (busy != null) return say(t('waitBusy'));
    _flush();
    project = p;
    _past.clear();
    _future.clear();
    selected = hint = awaiting = null;
    preview = null;
    tool = Tool.select;
    notifyListeners();
    SharedPreferences.getInstance().then((s) => s.setString('project', p.id));
  }

  /// Change the open idea. Undoable edits snapshot it first; everything autosaves.
  void edit(void Function(Project p) fn, {bool undoable = true}) {
    final p = project;
    if (p == null) return;
    if (undoable) {
      _past.add(_snap(p));
      if (_past.length > 60) _past.removeAt(0);
      _future.clear();
    }
    fn(p);
    p.updatedAt = DateTime.now().millisecondsSinceEpoch;
    notifyListeners();
    _save?.cancel();
    _save = Timer(const Duration(milliseconds: 700), _flush);
  }

  // Undo snapshots leave the chat out: undoing a mark must never delete what the assistant said.
  String _snap(Project p) => jsonEncode(p.toJson()..remove('messages'));
  void _restore(String s) {
    final old = project!;
    project = Project.fromJson({...jsonDecode(s) as Map<String, dynamic>, 'messages': [for (final m in old.messages) m.toJson()]});
    edit((_) {}, undoable: false); // notify + autosave
  }

  void undo() {
    if (!canUndo) return;
    _future.insert(0, _snap(project!));
    _restore(_past.removeLast());
    selected = null;
  }

  void redo() {
    if (!canRedo) return;
    _past.add(_snap(project!));
    _restore(_future.removeAt(0));
    selected = null;
  }

  Future<void> _flush() async {
    _save?.cancel();
    _save = null;
    final p = project;
    if (p == null || p.versions.isEmpty) return; // an empty idea isn't worth a file
    try {
      await Api.i.put('/api/projects/${p.id}', p.toJson());
    } catch (e) {
      say('${t('saveFailed')}: $e');
    }
  }

  void addMessage(String role, String text, {List<Chip2>? chips, String? rule, String? fix}) => edit((p) {
        p.messages.add(Message(id: uid(), role: role, text: text, chips: chips, rule: rule, fix: fix));
        if (p.messages.length > 200) p.messages.removeAt(0);
      }, undoable: false);

  void removeItem(String id) => edit((p) {
        p.scene.elements.removeWhere((e) => e.uid == id);
        p.scene.marks.removeWhere((m) => m.uid == id);
        if (selected == id) selected = null;
      });
}
