// One sentence -> Claude's plan -> masked render with paste-back -> new version -> background check.
// A port of src/turn.ts: same requests, same masks, same rules.
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'api.dart';
import 'models.dart';
import 'raster.dart';
import 'state.dart';

final _ar = RegExp(r'[؀-ۿ]');
AppState get _s => AppState.i;

/// Start a fresh base image (photo or blank board) as the idea's first version.
Future<void> newBase(Uint8List png, String note) async {
  _s.project ??= _s.newProject();
  final prev = _s.busy;
  _s.update(() => _s.busy = _s.t('saving'));
  try {
    final file = await Api.i.upload(png);
    final v = Version(id: uid(), file: file, note: note, parent: null, at: DateTime.now().millisecondsSinceEpoch);
    _s.edit((p) {
      p.versions.add(v);
      p.current = v.id;
      p.scene = Scene();
    });
  } finally {
    _s.update(() => _s.busy = prev);
  }
}

Future<ui.Image> currentBase() async {
  final v = _s.project?.version;
  if (v == null) throw StateError('No picture yet.');
  return loadImage(Api.i.fileUrl(v.file));
}

Future<void> runTurn(String sentence) async {
  sentence = sentence.trim();
  if (sentence.isEmpty || _s.busy != null) return;
  _s.project ??= _s.newProject();
  final lang = _ar.hasMatch(sentence) ? 'ar' : 'en';
  final pid = _s.project!.id;
  bool here() => _s.project?.id == pid;
  void reply(String text, {List<Chip2>? chips, String? rule, String? fix}) {
    if (here()) _s.addMessage('agent', text, chips: chips, rule: rule, fix: fix);
  }

  _s.update(() {
    _s.busy = _s.t('thinking'); // claim the turn now, so a double tap can't send twice
    _s.hint = _s.awaiting = _s.selected = null;
    _s.draft = '';
  });
  _s.addMessage('user', sentence);
  if (RegExp(r'^(Untitled idea|New idea|فكرة جديدة)$').hasMatch(_s.project!.name)) _s.edit((p) => p.name = sentence.substring(0, math.min(48, sentence.length)), undoable: false);
  try {
    if (_s.project!.current == null) await newBase(await blankBoard('1:1'), 'blank');
    final project = _s.project!;
    final scene = Scene.fromJson(project.scene.toJson()); // the exact scene Claude plans on is the scene that gets rendered
    final base = await currentBase();
    final w = base.width, h = base.height;
    final empty = project.version!.note == 'blank' && scene.elements.isEmpty && scene.marks.isEmpty;
    final overlay = await compose(base, scene, marks: 'all', tags: true);
    final history = [
      for (final m in project.messages.sublist(math.max(0, project.messages.length - 9), project.messages.length - 1)) {'role': m.role, 'text': m.text.substring(0, math.min(1000, m.text.length))}
    ];
    final res = await Api.i.post('/api/turn', {
      'sentence': sentence, 'lang': lang, 'w': w, 'h': h, 'scene': scene.toJson(), 'history': history,
      'base': empty ? null : await forClaude(base),
      'overlay': empty ? null : await forClaude(overlay),
    }) as Map<String, dynamic>;
    if (!here()) return;
    final plan = res['plan'] as Map<String, dynamic>;
    final assumptions = [for (final a in plan['assumptions'] as List) Chip2(a['alt'] as String, a['alt'] as String)];
    final rule = plan['rule_suggestion'] as String? ?? '';
    reply((plan['reply'] as String?)?.isNotEmpty == true ? plan['reply'] as String : '…', chips: assumptions.isEmpty ? null : assumptions, rule: rule.isEmpty ? null : rule);

    switch (plan['action']) {
      case 'reply':
        if (!locates(scene)) _askWhere(sentence); // the one allowed question: where?
        return;
      case 'make_part':
        _s.update(() => _s.busy = _s.t('rendering'));
        await Api.i.post('/api/part', {'plan': plan});
        reply(_s.t('partMade'));
        return;
    }
    await _render(sentence, plan, lang, scene, base, reply, here);
  } catch (e) {
    reply('${_s.t('error')}: $e');
  } finally {
    _s.update(() {
      _s.busy = null;
      _s.preview = null;
    });
  }
}

void _askWhere(String sentence) => _s.update(() {
      _s.tool = Tool.pen;
      _s.hint = _s.t('tapWhere');
      _s.awaiting = sentence;
    });

Future<void> _render(String sentence, Map<String, dynamic> plan, String lang, Scene scene, ui.Image base,
    void Function(String, {List<Chip2>? chips, String? rule, String? fix}) reply, bool Function() here) async {
  final w = base.width, h = base.height;
  final parent = _s.project!.current;
  Masks? masks;
  String? mask;
  if (plan['action'] == 'edit' && plan['region'] != 'whole') {
    final region = await regionMask(scene, plan['region'] as String, w, h);
    if (region == null) {
      // An edit with nothing marked would regenerate the whole picture: ask for the spot instead.
      reply(_s.t('tapWhere'));
      _askWhere(sentence);
      return;
    }
    final short = math.min(w, h);
    final expand = ((math.min(25.0, math.max(0.0, (plan['expand_pct'] as num).toDouble())) / 100) * short).round();
    masks = buildMasks(region, w, h, expand, math.max(4, (short * 0.012).round()));
  }

  _s.update(() => _s.busy = _s.t('rendering'));
  final composite = await compose(base, scene); // photo + dropped elements, no red marks
  final basePx = await rgba(base);
  final (W, H) = apiSize(w, h);
  if (masks != null) mask = await apiMask(masks.paintable, w, h, W, H);
  final refs = <String>[];
  for (final e in scene.elements.where((e) => e.kind == 'part').take(8)) {
    final img = await loadImage(Api.i.abs(e.url));
    final s = math.min(1.0, 1024 / math.max(img.width, img.height));
    refs.add(await dataUrl(await scaled(img, (img.width * s).round(), (img.height * s).round())));
  }

  ui.Image? last;
  await for (final ev in Api.i.render({'plan': plan, 'scene': scene.toJson(), 'image': await dataUrl(await scaled(composite, W, H)), 'mask': mask, 'refs': refs, 'size': '${W}x$H'})) {
    if (ev['type'] == 'error') throw ApiError(ev['message'] as String);
    final result = await scaled(await decode(base64Decode(ev['b64'] as String)), w, h);
    var img = result;
    if (masks != null) img = await fromRgba(pasteBack(basePx, await rgba(result), masks.soft, masks.ring), w, h);
    if (ev['type'] == 'partial') {
      if (here()) {
        final shot = await png(img);
        _s.update(() => _s.preview = shot);
      }
    } else {
      last = img;
    }
  }
  if (last == null) throw ApiError('No image came back.');
  if (!here()) return;

  final finalPng = await png(last);
  _s.update(() {
    _s.preview = finalPng;
    _s.busy = _s.t('saving');
  });
  final file = await Api.i.upload(finalPng);
  if (!here()) return;
  final v = Version(id: uid(), file: file, note: sentence.substring(0, math.min(140, sentence.length)), parent: parent, at: DateTime.now().millisecondsSinceEpoch);
  // What was rendered is now part of the picture; dimensions, notes and anything not in the plan's scene stay.
  final used = {...scene.elements.map((e) => e.uid), ...scene.marks.where((m) => m.type != 'dimension' && m.type != 'text').map((m) => m.uid)};
  final keepScale = masks != null; // a local edit keeps the camera, so the scale still holds
  _s.edit((p) {
    p.versions.add(v);
    p.current = v.id;
    p.scene.elements.removeWhere((e) => used.contains(e.uid));
    p.scene.marks.removeWhere((m) => used.contains(m.uid));
    if (!keepScale) p.scene.pxPerCm = null;
  });
  _s.update(() => _s.tool = Tool.select);
  _check(sentence, plan, base, last, lang, reply);
}

Future<void> _check(String sentence, Map<String, dynamic> plan, ui.Image before, ui.Image after, String lang, void Function(String, {List<Chip2>? chips, String? rule, String? fix}) reply) async {
  try {
    final c = await Api.i.post('/api/check', {'sentence': sentence, 'plan': plan, 'before': await forClaude(before), 'after': await forClaude(after), 'lang': lang}) as Map;
    if (c['ok'] != true && (c['issue'] as String? ?? '').isNotEmpty) reply(c['issue'] as String, fix: (c['fix'] as String?)?.isEmpty == true ? null : c['fix'] as String?);
  } catch (_) {/* best effort: never block him on the check */}
}

/// Drop a catalog element onto the board, true to scale when he set one.
Future<void> addCatalog(CatalogItem item) async {
  if (_s.busy != null) return _s.say(_s.t('waitBusy'));
  if (_s.project?.current == null) await newBase(await blankBoard('1:1'), 'blank');
  final base = await currentBase();
  final w = base.width.toDouble(), h = base.height.toDouble(), short = math.min(w, h);
  final url = '/elements/${item.id}.svg';
  final art = await loadArt(Api.i.abs(url));
  final aspect = art.size.width / art.size.height;
  final px = _s.project!.scene.pxPerCm;
  double ew, eh;
  if (px != null) {
    ew = (item.size[0] * px).clamp(short * 0.03, short * 0.95);
    eh = ew / aspect;
  } else {
    ew = short * 0.28;
    eh = ew / aspect;
    if (eh > short * 0.5) {
      ew *= (short * 0.5) / eh;
      eh = short * 0.5;
    }
  }
  final e = SceneElement(uid: uid(), kind: 'catalog', ref: item.id, name: item.en, prompt: item.prompt, url: url, x: w / 2, y: h / 2, w: ew, h: eh, hinge: item.hinge, sizeCm: item.size);
  _s.edit((p) => p.scene.elements.add(e));
  _s.update(() {
    _s.selected = e.uid;
    _s.tool = Tool.select;
  });
}
