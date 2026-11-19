// The board: his photo, dropped elements and red marks, drawn natively. One finger uses the tool,
// two fingers always pan and zoom, double-tap fits the picture back on screen.
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'api.dart';
import 'models.dart';
import 'raster.dart';
import 'state.dart';
import 'turn.dart';

class BoardView extends StatefulWidget {
  const BoardView({super.key});
  @override
  State<BoardView> createState() => _BoardViewState();
}

enum _Drag { none, view, element, draw }

class _BoardViewState extends State<BoardView> {
  final s = AppState.i;
  ui.Image? base, preview;
  String? baseFile;
  final arts = <String, Art>{};
  double scale = 1;
  Offset offset = Offset.zero;
  Size area = Size.zero;
  bool fitted = false;

  _Drag drag = _Drag.none;
  Mark? draft;
  double startScale = 1;
  Offset startFocalWorld = Offset.zero, grab = Offset.zero;
  int pointers = 0;

  @override
  void initState() {
    super.initState();
    s.addListener(_sync);
    _sync();
  }

  @override
  void dispose() {
    s.removeListener(_sync);
    super.dispose();
  }

  Future<void> _sync() async {
    final v = s.project?.version;
    if (v?.file != baseFile) {
      baseFile = v?.file;
      final keepView = base != null && v != null;
      final img = v == null ? null : await loadImage(Api.i.fileUrl(v.file)).then<ui.Image?>((i) => i, onError: (_) => base);
      if (!mounted || baseFile != v?.file) return;
      final sameSize = img != null && base != null && img.width == base!.width && img.height == base!.height;
      setState(() {
        base = img;
        if (!(keepView && sameSize)) fitted = false;
      });
    }
    for (final e in s.project?.scene.elements ?? const <SceneElement>[]) {
      if (!arts.containsKey(e.url)) {
        loadArt(e.url).then((a) {
          if (mounted) setState(() => arts[e.url] = a);
        }, onError: (_) {});
      }
    }
    final p = s.preview;
    if (p == null) {
      if (preview != null) setState(() => preview = null);
    } else {
      final img = await decode(p);
      if (mounted && s.preview == p) setState(() => preview = img);
    }
    if (mounted) setState(() {});
  }

  void fit() {
    final b = base;
    if (b == null || area.isEmpty) return;
    final pad = 16.0;
    final sc = math.min((area.width - pad * 2) / b.width, (area.height - pad * 2) / b.height);
    setState(() {
      scale = sc;
      offset = Offset((area.width - b.width * sc) / 2, (area.height - b.height * sc) / 2);
      fitted = true;
    });
  }

  Offset world(Offset local) => (local - offset) / scale;
  double get short => base == null ? 1000 : math.min(base!.width, base!.height).toDouble();

  SceneElement? hitElement(Offset w) {
    final els = s.project?.scene.elements ?? [];
    for (final e in els.reversed) {
      final a = -e.rotation * math.pi / 180;
      final d = w - Offset(e.x, e.y);
      final lx = d.dx * math.cos(a) - d.dy * math.sin(a), ly = d.dx * math.sin(a) + d.dy * math.cos(a);
      if (lx.abs() <= e.w / 2 && ly.abs() <= e.h / 2) return e;
    }
    return null;
  }

  Mark? hitMark(Offset w) {
    final tol = math.max(short * 0.03, 24 / scale);
    double segDist(Offset p, Offset a, Offset b) {
      final ab = b - a, t = ab.distanceSquared == 0 ? 0.0 : (((p - a).dx * ab.dx + (p - a).dy * ab.dy) / ab.distanceSquared).clamp(0.0, 1.0);
      return (p - (a + ab * t)).distance;
    }

    for (final m in (s.project?.scene.marks ?? <Mark>[]).reversed) {
      final pts = [for (final p in m.points) Offset(p[0], p[1])];
      if (pts.length == 1 && (pts[0] - w).distance < tol * 1.5) return m;
      for (var i = 1; i < pts.length; i++) {
        if (segDist(w, pts[i - 1], pts[i]) < tol) return m;
      }
    }
    return null;
  }

  void _addMark(String type, List<Pt> points, {String? text}) {
    final m = Mark(uid: uid(), type: type, points: points, text: text);
    s.edit((p) => p.scene.marks.add(m));
    // "Tap where": the spot he just marked answers the question, so the sentence goes again.
    final again = s.awaiting;
    if (again != null && type != 'text') {
      s.update(() => s.awaiting = s.hint = null);
      runTurn(again);
    }
  }

  Future<void> _tap(Offset local) async {
    if (base == null || s.busy != null) return;
    final w = world(local);
    switch (s.tool) {
      case Tool.select:
        final e = hitElement(w);
        s.update(() => s.selected = e?.uid);
      case Tool.point:
        _addMark('point', [[w.dx, w.dy]]);
      case Tool.eraser:
        final hit = hitMark(w)?.uid ?? hitElement(w)?.uid;
        if (hit != null) s.removeItem(hit);
      case Tool.text:
        final text = await _ask(context, s.t('note'));
        if (text != null && text.trim().isNotEmpty) _addMark('text', [[w.dx, w.dy]], text: text.trim());
      default:
        break;
    }
  }

  void _start(ScaleStartDetails d) {
    pointers = d.pointerCount;
    startScale = scale;
    startFocalWorld = world(d.localFocalPoint);
    if (base == null) return;
    if (d.pointerCount > 1 || s.busy != null) {
      drag = _Drag.view;
      return;
    }
    final w = world(d.localFocalPoint);
    switch (s.tool) {
      case Tool.select:
        final e = hitElement(w);
        if (e != null) {
          s.edit((_) {}); // undo snapshot before the move
          s.update(() => s.selected = e.uid);
          grab = w - Offset(e.x, e.y);
          drag = _Drag.element;
        } else {
          drag = _Drag.view;
        }
      case Tool.pen:
      case Tool.arrow:
        drag = _Drag.draw;
        draft = Mark(uid: 'draft', type: s.tool == Tool.pen ? 'pen' : 'arrow', points: [[w.dx, w.dy], if (s.tool == Tool.arrow) [w.dx, w.dy]]);
      default:
        drag = _Drag.view;
    }
  }

  void _update(ScaleUpdateDetails d) {
    if (d.pointerCount > 1 && drag != _Drag.view) {
      // A second finger landed mid-stroke: it becomes a zoom, and the half-drawn mark is dropped.
      drag = _Drag.view;
      draft = null;
      startScale = scale;
      startFocalWorld = world(d.localFocalPoint);
    }
    final w = world(d.localFocalPoint);
    switch (drag) {
      case _Drag.view:
        final fitScale = base == null ? 1.0 : math.min(area.width / base!.width, area.height / base!.height);
        final ns = (startScale * d.scale).clamp(fitScale * 0.4, 8.0);
        setState(() {
          scale = ns;
          offset = d.localFocalPoint - startFocalWorld * ns;
          fitted = true;
        });
      case _Drag.element:
        final e = s.project?.scene.elements.where((x) => x.uid == s.selected).firstOrNull;
        if (e == null) return;
        s.update(() {
          e.x = w.dx - grab.dx;
          e.y = w.dy - grab.dy;
        });
      case _Drag.draw:
        final m = draft;
        if (m == null) return;
        setState(() {
          if (m.type == 'pen') {
            final last = m.points.last;
            if ((Offset(last[0], last[1]) - w).distance > 2 / scale) m.points.add([w.dx, w.dy]);
          } else {
            m.points[1] = [w.dx, w.dy];
          }
        });
      case _Drag.none:
        break;
    }
  }

  void _end(ScaleEndDetails d) {
    final m = draft;
    if (drag == _Drag.draw && m != null) {
      final a = Offset(m.points.first[0], m.points.first[1]), b = Offset(m.points.last[0], m.points.last[1]);
      if (m.type == 'pen' && m.points.length > 2) _addMark('pen', m.points);
      if (m.type == 'arrow' && (a - b).distance > short * 0.02) _addMark('arrow', m.points);
    }
    if (drag == _Drag.element) s.edit((_) {}, undoable: false); // save where it landed
    setState(() {
      draft = null;
      drag = _Drag.none;
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final size = Size(c.maxWidth, c.maxHeight);
      if (size != area) {
        area = size;
        fitted = false;
      }
      if (!fitted && base != null) WidgetsBinding.instance.addPostFrameCallback((_) => mounted && !fitted ? fit() : null);
      return GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapUp: (d) => _tap(d.localPosition),
        onDoubleTap: fit,
        onScaleStart: _start,
        onScaleUpdate: _update,
        onScaleEnd: _end,
        child: CustomPaint(
          size: size,
          painter: _BoardPainter(
            base: preview ?? base,
            scene: s.project?.scene,
            showScene: preview == null,
            arts: arts,
            draft: draft,
            selected: s.selected,
            scale: scale,
            offset: offset,
          ),
        ),
      );
    });
  }
}

class _BoardPainter extends CustomPainter {
  _BoardPainter({required this.base, required this.scene, required this.showScene, required this.arts, required this.draft, required this.selected, required this.scale, required this.offset});
  final ui.Image? base;
  final Scene? scene;
  final bool showScene;
  final Map<String, Art> arts;
  final Mark? draft;
  final String? selected;
  final double scale;
  final Offset offset;

  @override
  void paint(Canvas c, Size size) {
    c.drawRect(Offset.zero & size, Paint()..color = const Color(0xFFF3F4F6));
    final b = base;
    if (b == null) return;
    c.save();
    c.translate(offset.dx, offset.dy);
    c.scale(scale);
    final rect = Rect.fromLTWH(0, 0, b.width.toDouble(), b.height.toDouble());
    c.drawRect(rect.inflate(1 / scale), Paint()..color = const Color(0x14000000));
    c.drawImage(b, Offset.zero, Paint()..filterQuality = FilterQuality.medium);
    final short = math.min(b.width, b.height).toDouble();
    final sc = scene;
    if (sc != null && showScene) {
      c.clipRect(rect);
      for (final e in sc.elements) {
        paintElement(c, e, arts[e.url]);
        if (e.uid == selected) {
          c.save();
          c.translate(e.x, e.y);
          c.rotate(e.rotation * math.pi / 180);
          c.drawRect(Rect.fromCenter(center: Offset.zero, width: e.w, height: e.h).inflate(4 / scale),
              Paint()..color = const Color(0xFFCF5A1E)..style = PaintingStyle.stroke..strokeWidth = 2 / scale);
          c.restore();
        }
      }
      for (final m in sc.marks) {
        paintMark(c, m, short, selected: m.uid == selected);
      }
      if (draft != null) paintMark(c, draft!, short);
    }
    c.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

Future<String?> _ask(BuildContext context, String label) {
  final field = TextEditingController();
  final t = AppState.i.t;
  return showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(label),
      content: TextField(controller: field, autofocus: true, textDirection: null, onSubmitted: (v) => Navigator.pop(c, v)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: Text(t('cancel'))),
        FilledButton(onPressed: () => Navigator.pop(c, field.text), child: Text(t('ok'))),
      ],
    ),
  );
}
