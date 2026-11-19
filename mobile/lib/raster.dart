// Pixel work for the "change only what I marked" guarantee, ported line for line from src/canvas/raster.ts.
// The pure functions (top half) are unit-tested; the dart:ui helpers (bottom half) feed them.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'api.dart';
import 'models.dart';

// ---------- pure ----------

/// Size the image API accepts: edges multiple of 16, 655,360 to 8,294,400 px, edge < 3840, ratio <= 3:1.
(int, int) apiSize(int w, int h) {
  const minPx = 655360, maxPx = 8294400, edge = 3824;
  double s = 1;
  if (w * h < minPx) s = math.sqrt(minPx / (w * h));
  if (w * h * s * s > maxPx) s = math.sqrt(maxPx / (w * h));
  s = math.min(s, edge / math.max(w, h));
  var W = math.max(16, ((w * s) / 16).round() * 16), H = math.max(16, ((h * s) / 16).round() * 16);
  if (W > 3 * H) W = 3 * H;
  if (H > 3 * W) H = 3 * W;
  while (W * H > maxPx || math.max(W, H) > edge) {
    if (W >= H) {
      W -= 16;
    } else {
      H -= 16;
    }
  }
  while (W * H < minPx) {
    if (W <= H) {
      W += 16;
    } else {
      H += 16;
    }
  }
  return (W, H);
}

/// Separable box sum/blur with zero padding. mean=false returns raw window sums.
Float32List boxBlur(Float32List src, int w, int h, int r, {bool mean = true}) {
  if (r <= 0) return Float32List.fromList(src);
  final tmp = Float32List(src.length), out = Float32List(src.length);
  for (var y = 0; y < h; y++) {
    final row = y * w;
    double acc = 0;
    for (var x = 0; x <= math.min(r, w - 1); x++) {
      acc += src[row + x];
    }
    for (var x = 0; x < w; x++) {
      tmp[row + x] = acc;
      final add = x + r + 1, sub = x - r;
      if (add < w) acc += src[row + add];
      if (sub >= 0) acc -= src[row + sub];
    }
  }
  for (var x = 0; x < w; x++) {
    double acc = 0;
    for (var y = 0; y <= math.min(r, h - 1); y++) {
      acc += tmp[y * w + x];
    }
    for (var y = 0; y < h; y++) {
      out[y * w + x] = acc;
      final add = y + r + 1, sub = y - r;
      if (add < h) acc += tmp[add * w + x];
      if (sub >= 0) acc -= tmp[sub * w + x];
    }
  }
  if (mean) {
    final n = (2 * r + 1) * (2 * r + 1);
    for (var i = 0; i < out.length; i++) {
      out[i] /= n;
    }
  }
  return out;
}

/// Square dilation of a 0/1 mask by r px.
Float32List dilate(Float32List mask, int w, int h, int r) {
  if (r <= 0) return Float32List.fromList(mask);
  final sum = boxBlur(mask, w, h, r, mean: false);
  for (var i = 0; i < sum.length; i++) {
    sum[i] = sum[i] > 0.5 ? 1 : 0;
  }
  return sum;
}

class Masks {
  Masks(this.soft, this.paintable, this.ring);
  final Float32List soft, paintable, ring;
}

/// region -> soft (1 inside region+expand, fades to 0 over 2*feather), paintable (what the model may change),
/// ring (just outside it, for colour matching).
Masks buildMasks(Float32List region, int w, int h, int expand, int feather) {
  final editable = dilate(region, w, h, expand);
  final outer = dilate(editable, w, h, feather);
  final soft = boxBlur(outer, w, h, feather);
  for (var i = 0; i < soft.length; i++) {
    final t = soft[i] < 1 / 1024 ? 0.0 : math.min(1.0, soft[i]);
    soft[i] = t * t * (3 - 2 * t); // smoothstep
  }
  final paintable = dilate(editable, w, h, 2 * feather);
  final band = dilate(paintable, w, h, feather);
  final ring = Float32List(band.length);
  for (var i = 0; i < band.length; i++) {
    ring[i] = band[i] != 0 && paintable[i] == 0 && soft[i] == 0 ? 1 : 0;
  }
  return Masks(soft, paintable, ring);
}

/// Composite the model's result into the original. Where soft = 0 the output is the original, byte for byte.
Uint8List pasteBack(Uint8List base, Uint8List result, Float32List soft, [Float32List? ring]) {
  final off = [0.0, 0.0, 0.0];
  if (ring != null) {
    var n = 0;
    for (var p = 0, i = 0; p < ring.length; p++, i += 4) {
      if (ring[p] == 0) continue;
      n++;
      for (var c = 0; c < 3; c++) {
        off[c] += base[i + c] - result[i + c];
      }
    }
    if (n > 0) {
      for (var c = 0; c < 3; c++) {
        off[c] /= n;
      }
    }
  }
  final out = Uint8List(base.length);
  for (var p = 0, i = 0; p < soft.length; p++, i += 4) {
    final m = soft[p];
    if (m == 0) {
      out[i] = base[i];
      out[i + 1] = base[i + 1];
      out[i + 2] = base[i + 2];
      out[i + 3] = base[i + 3];
      continue;
    }
    for (var c = 0; c < 3; c++) {
      // Uint8ClampedArray in the web version: round and clamp the same way.
      out[i + c] = (base[i + c] + (result[i + c] + off[c] - base[i + c]) * m).round().clamp(0, 255);
    }
    out[i + 3] = 255;
  }
  return out;
}

bool locates(Scene s) => s.elements.isNotEmpty || s.marks.any((m) => m.type == 'pen' || m.type == 'point' || m.type == 'arrow');

// ---------- drawing (shared by the on-screen board and the exported images) ----------

const red = Color(0xFFE5262E), dimBlue = Color(0xFF2457A6), ink = Color(0xFF16191D);

/// An element's artwork: catalog items are SVG pictures, parts are bitmaps.
class Art {
  Art.picture(this.picture, this.size) : image = null;
  Art.image(ui.Image this.image)
      : picture = null,
        size = Size(image.width.toDouble(), image.height.toDouble());
  final ui.Picture? picture;
  final ui.Image? image;
  final Size size;
}

final _art = <String, Future<Art>>{};
final _images = <String, Future<ui.Image>>{};

Future<ui.Image> decode(Uint8List bytes, {int? maxEdge}) async {
  if (maxEdge != null) {
    final probe = await (await ui.instantiateImageCodec(bytes)).getNextFrame();
    final w = probe.image.width, h = probe.image.height;
    if (math.max(w, h) <= maxEdge) return probe.image;
    final s = maxEdge / math.max(w, h);
    final codec = await ui.instantiateImageCodec(bytes, targetWidth: (w * s).round(), targetHeight: (h * s).round());
    return (await codec.getNextFrame()).image;
  }
  return (await (await ui.instantiateImageCodec(bytes)).getNextFrame()).image;
}

Future<ui.Image> loadImage(String url) => _images[url = Api.i.abs(url)] ??= Api.i.bytes(url).then(decode).catchError((Object e) {
      _images.remove(url);
      throw e;
    });

Future<Art> loadArt(String url) => _art[url = Api.i.abs(url)] ??= () async {
      final bytes = await Api.i.bytes(url);
      if (url.endsWith('.svg') || (bytes.length > 4 && utf8.decode(bytes.sublist(0, math.min(200, bytes.length)), allowMalformed: true).contains('<svg'))) {
        final info = await vg.loadPicture(SvgBytesLoader(bytes), null);
        return Art.picture(info.picture, info.size);
      }
      return Art.image(await decode(bytes));
    }().catchError((Object e) {
      _art.remove(url);
      throw e;
    });

void paintArt(Canvas c, Art a, Rect dst) {
  if (a.image != null) {
    c.drawImageRect(a.image!, Offset.zero & a.size, dst, Paint()..filterQuality = FilterQuality.high);
    return;
  }
  c.save();
  c.translate(dst.left, dst.top);
  c.scale(dst.width / a.size.width, dst.height / a.size.height);
  c.drawPicture(a.picture!);
  c.restore();
}

void paintElement(Canvas c, SceneElement e, Art? a) {
  c.save();
  c.translate(e.x, e.y);
  c.rotate(e.rotation * math.pi / 180);
  if (e.flipX) c.scale(-1, 1);
  final dst = Rect.fromCenter(center: Offset.zero, width: e.w, height: e.h);
  if (a != null) {
    paintArt(c, a, dst);
  } else {
    c.drawRect(dst, Paint()..color = const Color(0x22000000));
  }
  c.restore();
}

void _label(Canvas c, String text, Offset at, double fs, {required Color fg, Color? bg, Color? border, double pad = 0.4, bool bold = false, bool centre = false}) {
  final tp = TextPainter(
    text: TextSpan(text: text, style: TextStyle(color: fg, fontSize: fs, fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
    textDirection: RegExp(r'[؀-ۿ]').hasMatch(text) ? TextDirection.rtl : TextDirection.ltr,
  )..layout();
  final p = fs * pad;
  var box = Rect.fromLTWH(at.dx, at.dy, tp.width + p * 2, tp.height + p * 2);
  if (centre) box = box.shift(Offset(-box.width / 2, -box.height / 2));
  final r = RRect.fromRectAndRadius(box, Radius.circular(fs * 0.3));
  if (bg != null) c.drawRRect(r, Paint()..color = bg);
  if (border != null) c.drawRRect(r, Paint()..color = border..style = PaintingStyle.stroke..strokeWidth = fs * 0.08);
  tp.paint(c, box.topLeft + Offset(p, p));
}

/// The same look as the web board: red marks, a blue dimension line, white note labels.
void paintMark(Canvas c, Mark m, double short, {bool selected = false}) {
  final sw = short * 0.005;
  final pts = [for (final p in m.points) Offset(p[0], p[1])];
  if (pts.isEmpty) return;
  final glow = selected ? (Paint()..color = const Color(0xFFCF5A1E)..style = PaintingStyle.stroke..strokeWidth = sw * 4..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round) : null;
  final stroke = Paint()..color = red..style = PaintingStyle.stroke..strokeWidth = sw..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
  switch (m.type) {
    case 'pen':
      final path = Path()..moveTo(pts[0].dx, pts[0].dy);
      for (final p in pts.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      if (glow != null) c.drawPath(path, glow);
      c.drawPath(path, stroke);
    case 'point':
      final r = short * 0.014;
      if (glow != null) c.drawCircle(pts[0], r * 1.4, glow..style = PaintingStyle.fill);
      c.drawCircle(pts[0], r, Paint()..color = red);
      c.drawCircle(pts[0], r, Paint()..color = const Color(0xFFFFFFFF)..style = PaintingStyle.stroke..strokeWidth = sw * 0.6);
    case 'arrow':
      if (pts.length < 2) return;
      final a = pts.first, b = pts.last;
      final ang = math.atan2(b.dy - a.dy, b.dx - a.dx);
      final len = short * 0.03, half = short * 0.013;
      final base = b - Offset(math.cos(ang), math.sin(ang)) * len;
      final n = Offset(-math.sin(ang), math.cos(ang)) * half;
      if (glow != null) c.drawLine(a, b, glow);
      c.drawLine(a, base, stroke);
      c.drawPath(Path()..moveTo(b.dx, b.dy)..lineTo(base.dx + n.dx, base.dy + n.dy)..lineTo(base.dx - n.dx, base.dy - n.dy)..close(), Paint()..color = red);
    case 'dimension':
      if (pts.length < 2) return;
      final a = pts.first, b = pts.last;
      final ang = math.atan2(b.dy - a.dy, b.dx - a.dx);
      final tk = Offset(-math.sin(ang), math.cos(ang)) * (short * 0.014);
      final p = Paint()..color = dimBlue..strokeWidth = sw * 0.7..style = PaintingStyle.stroke;
      if (glow != null) c.drawLine(a, b, glow);
      c.drawLine(a, b, p);
      c.drawLine(a - tk, a + tk, p);
      c.drawLine(b - tk, b + tk, p);
      if ((m.text ?? '').isNotEmpty) _label(c, m.text!, (a + b) / 2, short * 0.026, fg: dimBlue, bg: const Color(0xFFFFFFFF), border: dimBlue, pad: 0.3, bold: true, centre: true);
    default: // text note
      final fs = short * 0.026;
      if (glow != null) c.drawCircle(pts[0], fs, glow..style = PaintingStyle.fill);
      _label(c, m.text ?? '', pts[0], fs, fg: ink, bg: const Color(0xF0FFFFFF), border: ink);
  }
}

/// E#/M# badges: only ever drawn into the overlay image Claude reads.
void paintTags(Canvas c, Scene s, double short) {
  final fs = short * 0.03;
  for (var i = 0; i < s.elements.length; i++) {
    final e = s.elements[i];
    _label(c, 'E${i + 1}', Offset(e.x - e.w / 2, e.y - e.h / 2 - fs * 1.6), fs, fg: const Color(0xFFFFFFFF), bg: ink, pad: 0.25, bold: true);
  }
  for (var i = 0; i < s.marks.length; i++) {
    final m = s.marks[i];
    final x = m.points.map((p) => p[0]).reduce(math.min), y = m.points.map((p) => p[1]).reduce(math.min);
    _label(c, 'M${i + 1}', Offset(x, y - fs * 1.6), fs, fg: const Color(0xFFFFFFFF), bg: ink, pad: 0.25, bold: true);
  }
}

// ---------- images ----------

Future<ui.Image> _record(int w, int h, void Function(Canvas c) paint) {
  final rec = ui.PictureRecorder();
  paint(Canvas(rec));
  return rec.endRecording().toImage(w, h);
}

/// The photo plus dropped elements; marks: none | annotations (dimensions, notes) | all; tags for Claude.
Future<ui.Image> compose(ui.Image base, Scene s, {String marks = 'none', bool tags = false}) async {
  final arts = await Future.wait(s.elements.map((e) => loadArt(e.url).then<Art?>((a) => a, onError: (_) => null)));
  final short = math.min(base.width, base.height).toDouble();
  return _record(base.width, base.height, (c) {
    c.drawImage(base, Offset.zero, Paint()..filterQuality = FilterQuality.high);
    for (var i = 0; i < s.elements.length; i++) {
      paintElement(c, s.elements[i], arts[i]);
    }
    for (final m in s.marks) {
      if (marks == 'all' || (marks == 'annotations' && (m.type == 'dimension' || m.type == 'text'))) paintMark(c, m, short);
    }
    if (tags) paintTags(c, s, short);
  });
}

Future<ui.Image> scaled(ui.Image src, int w, int h, {FilterQuality q = FilterQuality.high}) =>
    _record(w, h, (c) => c.drawImageRect(src, Rect.fromLTWH(0, 0, src.width.toDouble(), src.height.toDouble()), Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()), Paint()..filterQuality = q));

Future<Uint8List> png(ui.Image img) async => (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
Future<String> dataUrl(ui.Image img) async => 'data:image/png;base64,${base64Encode(await png(img))}';
Future<Uint8List> rgba(ui.Image img) async => (await img.toByteData(format: ui.ImageByteFormat.rawRgba))!.buffer.asUint8List();

Future<ui.Image> fromRgba(Uint8List px, int w, int h) {
  final done = Completer<ui.Image>();
  ui.decodeImageFromPixels(px, w, h, ui.PixelFormat.rgba8888, done.complete);
  return done.future;
}

/// Downscaled copy for Claude (vision doesn't need full resolution).
Future<String> forClaude(ui.Image src, {int max = 1024}) async {
  final s = math.min(1.0, max / math.max(src.width, src.height));
  return dataUrl(s == 1 ? src : await scaled(src, (src.width * s).round(), (src.height * s).round()));
}

/// A photo from the camera or gallery: capped at 1536 px and re-encoded (drops EXIF/GPS).
Future<Uint8List> normalizePhoto(Uint8List bytes) async => png(await decode(bytes, maxEdge: 1536));

const aspects = {'1:1': (1536, 1536), '3:4': (1152, 1536), '4:3': (1536, 1152), '16:9': (1536, 864)};
Future<Uint8List> blankBoard(String aspect) {
  final (w, h) = aspects[aspect]!;
  return _record(w, h, (c) => c.drawRect(Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()), Paint()..color = const Color(0xFFFFFFFF))).then(png);
}

/// Rasterise the plan's region at base resolution into a 0/1 mask. Null when nothing locates the change.
Future<Float32List?> regionMask(Scene scene, String region, int w, int h) async {
  if (region == 'whole') return null;
  final marks = scene.marks.where((m) => m.type == 'pen' || m.type == 'point' || m.type == 'arrow').toList();
  if (scene.elements.isEmpty && marks.isEmpty) return null;
  final short = math.min(w, h).toDouble();
  final white = Paint()..color = const Color(0xFFFFFFFF);
  final img = await _record(w, h, (c) {
    for (final e in scene.elements) {
      c.save();
      c.translate(e.x, e.y);
      c.rotate(e.rotation * math.pi / 180);
      c.drawRect(Rect.fromCenter(center: Offset.zero, width: e.w, height: e.h), white);
      c.restore();
    }
    for (final m in marks) {
      if (m.type == 'pen') {
        final path = Path()..moveTo(m.points[0][0], m.points[0][1]);
        for (final p in m.points.skip(1)) {
          path.lineTo(p[0], p[1]);
        }
        path.close();
        c.drawPath(path, white);
        c.drawPath(path, Paint()..color = const Color(0xFFFFFFFF)..style = PaintingStyle.stroke..strokeWidth = math.max(16, short * 0.02)..strokeJoin = StrokeJoin.round..strokeCap = StrokeCap.round);
      } else {
        final p = m.points.last; // a dot, or the tip of an arrow
        c.drawCircle(Offset(p[0], p[1]), short * (m.type == 'point' ? 0.05 : 0.07), white);
      }
    }
  });
  final px = await rgba(img);
  final out = Float32List(w * h);
  for (var p = 0; p < out.length; p++) {
    out[p] = px[p * 4 + 3] > 0 ? 1 : 0;
  }
  return out;
}

/// API mask: transparent where the model may paint, opaque elsewhere, scaled to the API size.
Future<String> apiMask(Float32List paintable, int w, int h, int W, int H) async {
  final px = Uint8List(w * h * 4);
  for (var p = 0; p < paintable.length; p++) {
    px[p * 4 + 3] = paintable[p] != 0 ? 0 : 255;
  }
  return dataUrl(await scaled(await fromRgba(px, w, h), W, H, q: FilterQuality.none));
}
