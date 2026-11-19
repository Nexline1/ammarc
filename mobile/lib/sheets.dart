// Bottom sheets: ideas, elements, versions, chat, share — and the full-screen before/after.
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:share_plus/share_plus.dart';

import 'api.dart';
import 'main.dart';
import 'models.dart';
import 'raster.dart';
import 'state.dart';
import 'turn.dart';

AppState get _s => AppState.i;

Future<void> _sheet(BuildContext context, String title, Widget Function(BuildContext) body, {double height = 0.85}) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      builder: (c) => ListenableBuilder(
        listenable: _s,
        builder: (c, _) => Directionality(
          textDirection: _s.lang == 'ar' ? TextDirection.rtl : TextDirection.ltr,
          child: SizedBox(
            height: MediaQuery.of(c).size.height * height,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: ink))),
              Expanded(child: body(c)),
            ]),
          ),
        ),
      ),
    );

// ---------- Ideas ----------
Future<void> showIdeas(BuildContext context) {
  _s.refreshProjects().catchError((_) {});
  return _sheet(context, _s.t('ideas'), (c) => ListView(padding: const EdgeInsets.symmetric(horizontal: 12), children: [
        ListTile(
          leading: const CircleAvatar(backgroundColor: Color(0xFFFDF4EE), child: Icon(Icons.add_rounded, color: copper)),
          title: Text(_s.t('newIdea'), style: const TextStyle(fontWeight: FontWeight.w600)),
          onTap: () {
            Navigator.pop(c);
            _s.open(_s.newProject());
          },
        ),
        for (final p in _s.projects)
          ListTile(
            selected: p.id == _s.project?.id,
            leading: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(width: 48, height: 48, child: p.thumb == null ? const ColoredBox(color: Color(0xFFF3F4F6)) : Image.network(Api.i.fileUrl(p.thumb!), headers: Api.i.cookie, fit: BoxFit.cover)),
            ),
            title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text(_ago(p.updatedAt)),
            onTap: () {
              Navigator.pop(c);
              _s.openId(p.id).catchError((Object e) => _s.say('$e'));
            },
          ),
      ]));
}

String _ago(int ms) {
  final d = DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(ms));
  if (d.inMinutes < 1) return 'now';
  if (d.inHours < 1) return '${d.inMinutes} min';
  if (d.inDays < 1) return '${d.inHours} h';
  return '${d.inDays} d';
}

// ---------- Elements ----------
List<CatalogItem>? _catalog;
List<Map<String, dynamic>> _cats = [];

Future<void> showElements(BuildContext context) async {
  if (_catalog == null) {
    try {
      final j = await Api.i.get('/api/catalog') as Map<String, dynamic>;
      _catalog = [for (final i in j['items'] as List) CatalogItem.fromJson(i)];
      _cats = [for (final c in j['categories'] as List) c as Map<String, dynamic>];
    } catch (e) {
      return _s.say('$e');
    }
  }
  if (!context.mounted) return;
  return _sheet(context, _s.t('elements'), (c) => _Elements(onPick: (i) {
        Navigator.pop(c);
        addCatalog(i).catchError((Object e) => _s.say('$e'));
      }));
}

// Arabic-tolerant matching, as on the website: no diacritics/tatweel, one alef/ya/ta-marbuta form, Western digits.
String norm(String s) => s
    .toLowerCase()
    .replaceAll(RegExp('[ً-ٰٟـ]'), '')
    .replaceAll(RegExp('[أإآ]'), 'ا')
    .replaceAll('ى', 'ي')
    .replaceAll('ة', 'ه')
    .replaceAllMapped(RegExp('[٠-٩]'), (m) => '${'٠١٢٣٤٥٦٧٨٩'.indexOf(m[0]!)}');

class _Elements extends StatefulWidget {
  const _Elements({required this.onPick});
  final ValueChanged<CatalogItem> onPick;
  @override
  State<_Elements> createState() => _ElementsState();
}

class _ElementsState extends State<_Elements> {
  String q = '';
  @override
  Widget build(BuildContext context) {
    final words = norm(q).split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    final items = _catalog!.where((i) {
      final hay = norm([i.id, i.en, i.ar, ...i.syn].join(' '));
      return words.every(hay.contains);
    }).toList();
    final ar = _s.lang == 'ar';
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: TextField(
          onChanged: (v) => setState(() => q = v),
          decoration: InputDecoration(hintText: _s.t('search'), prefixIcon: const Icon(Icons.search_rounded), filled: true, fillColor: const Color(0xFFF3F4F6), border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none)),
        ),
      ),
      Expanded(
        child: items.isEmpty
            ? Center(child: Text(_s.t('nothing')))
            : CustomScrollView(slivers: [
                for (final cat in _cats)
                  if (items.any((i) => i.cat == cat['id'])) ...[
                    SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 6), child: Text((ar ? cat['ar'] : cat['en']) as String, style: const TextStyle(fontWeight: FontWeight.w700, color: ink)))),
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      sliver: SliverGrid.count(crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 0.9, children: [
                        for (final i in items.where((i) => i.cat == cat['id']))
                          InkWell(
                            borderRadius: BorderRadius.circular(14),
                            onTap: () => widget.onPick(i),
                            child: Ink(
                              decoration: BoxDecoration(color: const Color(0xFFF7F8FA), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0x14000000))),
                              child: Column(children: [
                                Expanded(child: Padding(padding: const EdgeInsets.all(10), child: SvgPicture.network(Api.i.abs('/elements/${i.id}.svg'), headers: Api.i.cookie))),
                                Padding(padding: const EdgeInsets.fromLTRB(6, 0, 6, 8), child: Text(ar ? i.ar : i.en, maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
                              ]),
                            ),
                          ),
                      ]),
                    ),
                  ],
                const SliverToBoxAdapter(child: SizedBox(height: 24)),
              ]),
      ),
    ]);
  }
}

// ---------- Versions ----------
Future<void> showVersions(BuildContext context) => _sheet(context, _s.t('versions'), (c) {
      final p = _s.project!;
      return ListView(padding: const EdgeInsets.symmetric(horizontal: 12), children: [
        for (final v in p.versions.reversed)
          ListTile(
            selected: v.id == p.current,
            selectedTileColor: const Color(0xFFFDF4EE),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            leading: ClipRRect(borderRadius: BorderRadius.circular(10), child: SizedBox(width: 56, height: 56, child: Image.network(Api.i.fileUrl(v.file), headers: Api.i.cookie, fit: BoxFit.cover))),
            title: Text(v.note == 'photo' || v.note == 'blank' ? _s.t('original') : v.note, maxLines: 2, overflow: TextOverflow.ellipsis),
            subtitle: Text(_ago(v.at)),
            onTap: () {
              if (_s.busy != null) return;
              _s.edit((p) {
                p.current = v.id;
                p.scene.pxPerCm = null; // another picture, another camera: the scale no longer holds
              });
              Navigator.pop(c);
            },
          ),
      ]);
    });

// ---------- Before / after ----------
Future<void> showCompare(BuildContext context) {
  final p = _s.project!;
  final after = p.version!;
  final before = p.versions.firstWhere((v) => v.id == after.parent);
  return Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => _Compare(before: before, after: after)));
}

class _Compare extends StatefulWidget {
  const _Compare({required this.before, required this.after});
  final Version before, after;
  @override
  State<_Compare> createState() => _CompareState();
}

class _CompareState extends State<_Compare> {
  double split = 0.5;
  @override
  Widget build(BuildContext context) {
    final t = _s.t;
    return Scaffold(
      backgroundColor: ink,
      appBar: AppBar(backgroundColor: ink, foregroundColor: Colors.white, title: Text(t('compare'))),
      body: FutureBuilder<List<ui.Image>>(
        future: Future.wait([loadImage(Api.i.fileUrl(widget.before.file)), loadImage(Api.i.fileUrl(widget.after.file))]),
        builder: (context, snap) {
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final [b, a] = snap.data!;
          return LayoutBuilder(builder: (context, c) {
            final s = math.min(c.maxWidth / a.width, c.maxHeight / a.height);
            final w = a.width * s, h = a.height * s;
            return Center(
              child: GestureDetector(
                onHorizontalDragUpdate: (d) => setState(() => split = (split + d.delta.dx / w).clamp(0.0, 1.0)),
                onTapDown: (d) => setState(() => split = (d.localPosition.dx / w).clamp(0.0, 1.0)),
                child: SizedBox(
                  width: w, height: h,
                  child: Stack(children: [
                    Positioned.fill(child: RawImage(image: a, fit: BoxFit.fill)),
                    Positioned.fill(child: ClipRect(clipper: _Left(split), child: RawImage(image: b, fit: BoxFit.fill))),
                    Positioned(left: w * split - 1, top: 0, bottom: 0, child: Container(width: 2, color: Colors.white)),
                    Positioned(left: w * split - 18, top: h / 2 - 18, child: Container(width: 36, height: 36, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: const Icon(Icons.compare_arrows_rounded, color: ink))),
                    Positioned(left: 10, top: 10, child: _tag(t('before'))),
                    Positioned(right: 10, top: 10, child: _tag(t('after'))),
                  ]),
                ),
              ),
            );
          });
        },
      ),
    );
  }

  Widget _tag(String s) => Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(8)), child: Text(s, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)));
}

class _Left extends CustomClipper<Rect> {
  _Left(this.f);
  final double f;
  @override
  Rect getClip(Size size) => Rect.fromLTWH(0, 0, size.width * f, size.height);
  @override
  bool shouldReclip(_Left old) => old.f != f;
}

// ---------- Chat ----------
Future<void> showChat(BuildContext context, void Function([String?]) send) => _sheet(context, _s.t('assistant'), (c) {
      final msgs = _s.project?.messages ?? [];
      void go(String text) {
        Navigator.pop(c);
        send(text);
      }

      if (msgs.isEmpty) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_s.t('emptyChat'), textAlign: TextAlign.center)));
      return ListView(reverse: true, padding: const EdgeInsets.fromLTRB(14, 0, 14, 16), children: [
        for (final m in msgs.reversed)
          Align(
            alignment: m.role == 'user' ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 4),
              constraints: const BoxConstraints(maxWidth: 320),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(color: m.role == 'user' ? copper : const Color(0xFFF3F4F6), borderRadius: BorderRadius.circular(18)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m.text, style: TextStyle(color: m.role == 'user' ? Colors.white : ink, height: 1.35)),
                if (m.chips != null || m.fix != null || m.rule != null) const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  for (final ch in m.chips ?? <Chip2>[]) ActionChip(label: Text(ch.label), onPressed: () => go(ch.send)),
                  if (m.fix != null) ActionChip(avatar: const Icon(Icons.build_rounded, size: 16), label: Text(_s.t('fixIt')), onPressed: () => go(m.fix!)),
                  if (m.rule != null) ActionChip(avatar: const Icon(Icons.bookmark_add_outlined, size: 16), label: Text(_s.t('useRule')), onPressed: () => _saveRule(m.rule!)),
                ]),
              ]),
            ),
          ),
      ]);
    });

Future<void> _saveRule(String text) async {
  try {
    final mem = await Api.i.get('/api/memory') as Map<String, dynamic>;
    (mem['rules'] as List).add({'id': uid(), 'text': text});
    await Api.i.put('/api/memory', mem);
    _s.say(_s.t('ruleSaved'));
  } catch (e) {
    _s.say('$e');
  }
}

// ---------- Share ----------
Future<ui.Image> _picture() async => compose(await currentBase(), _s.project!.scene, marks: 'annotations');

Future<void> _sharePicture({String? text}) async {
  final bytes = await png(await _picture());
  await SharePlus.instance.share(ShareParams(text: text, files: [XFile.fromData(bytes, mimeType: 'image/png', name: 'ammarc.png')], fileNameOverrides: ['ammarc.png']));
}

Future<void> showShare(BuildContext context) => _sheet(context, _s.t('export'), (c) => const _Share(), height: 0.9);

class _Share extends StatefulWidget {
  const _Share();
  @override
  State<_Share> createState() => _ShareState();
}

class _ShareState extends State<_Share> {
  static const keys = ['title', 'hazard', 'consequence', 'solution'];
  late final fields = {for (final k in keys) k: TextEditingController(text: (_s.project?.pitch?[k] as String?) ?? '')};
  bool drafting = false, mailing = false;

  void _keep() => _s.edit((p) => p.pitch = {for (final k in keys) k: fields[k]!.text}, undoable: false);

  Future<void> draft() async {
    setState(() => drafting = true);
    try {
      final p = _s.project!;
      var root = p.version!; // the original photo this idea grew from
      for (Version? up = root; up != null; up = p.versions.where((v) => v.id == up!.parent).firstOrNull) {
        root = up;
      }
      final pitch = await Api.i.post('/api/pitch', {
        'lang': _s.lang,
        'history': [for (final m in p.messages.sublist(math.max(0, p.messages.length - 20))) {'role': m.role, 'text': m.text.substring(0, math.min(4000, m.text.length))}],
        'before': root.id == p.current ? null : await forClaude(await loadImage(Api.i.fileUrl(root.file))),
        'after': await forClaude(await _picture()),
      }) as Map<String, dynamic>;
      for (final k in keys) {
        fields[k]!.text = (pitch[k] as String?) ?? '';
      }
      _keep();
    } catch (e) {
      _s.say('$e');
    } finally {
      if (mounted) setState(() => drafting = false);
    }
  }

  String get pitchText => [for (final k in keys) if (fields[k]!.text.trim().isNotEmpty) k == 'title' ? fields[k]!.text.trim() : '${_s.t(k)}: ${fields[k]!.text.trim()}'].join('\n\n');

  Future<void> email() async {
    setState(() => mailing = true);
    try {
      final e = await Api.i.post('/api/email', {'lang': _s.lang, 'pitches': [{for (final k in keys) k: fields[k]!.text}]}) as Map<String, dynamic>;
      final text = '${e['subject']}\n\n${e['body']}';
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(e['subject'] as String),
          content: SingleChildScrollView(child: SelectableText(e['body'] as String)),
          actions: [
            TextButton(onPressed: () async {
              await Clipboard.setData(ClipboardData(text: text));
              _s.say(_s.t('copied'));
            }, child: Text(_s.t('copy'))),
            FilledButton(onPressed: () => _sharePicture(text: text), child: Text(_s.t('shareText'))),
          ],
        ),
      );
    } catch (e) {
      _s.say('$e');
    } finally {
      if (mounted) setState(() => mailing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _s.t;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
      FilledButton.icon(onPressed: () => _sharePicture().catchError((Object e) => _s.say('$e')), icon: const Icon(Icons.image_outlined), label: Text(t('shareImage'))),
      const SizedBox(height: 22),
      Row(children: [
        Expanded(child: Text(t('pitch'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: ink))),
        TextButton.icon(onPressed: drafting ? null : draft, icon: drafting ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome_rounded), label: Text(drafting ? t('drafting') : t('draft'))),
      ]),
      for (final k in keys)
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: TextField(controller: fields[k], minLines: k == 'title' ? 1 : 2, maxLines: 5, onChanged: (_) => _keep(), decoration: InputDecoration(labelText: t(k), border: const OutlineInputBorder())),
        ),
      const SizedBox(height: 14),
      OutlinedButton.icon(onPressed: () => _sharePicture(text: pitchText).catchError((Object e) => _s.say('$e')), icon: const Icon(Icons.ios_share_rounded), label: Text(t('sharePitch'))),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: mailing ? null : email, icon: const Icon(Icons.mail_outline_rounded), label: Text(t('email'))),
    ]);
  }
}
