// The pixel guarantees, checked the same way as tests/raster.test.ts on the web side.
import 'dart:typed_data';

import 'package:ammarc/mic.dart';
import 'package:ammarc/raster.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('apiSize matches the web: multiples of 16, inside the pixel budget', () {
    for (final (w, h) in [(1536, 1536), (1152, 1536), (1536, 864), (4032, 3024), (200, 100), (5000, 600)]) {
      final (W, H) = apiSize(w, h);
      expect(W % 16, 0);
      expect(H % 16, 0);
      expect(W * H, inInclusiveRange(655360, 8294400));
      expect(W < 3840 && H < 3840, isTrue);
      expect(W <= 3 * H && H <= 3 * W, isTrue);
    }
    expect(apiSize(1536, 1536), (1536, 1536));
  });

  test('pasteBack leaves every pixel outside the mask byte-identical', () {
    const w = 40, h = 30;
    final base = Uint8List(w * h * 4), result = Uint8List(w * h * 4);
    for (var i = 0; i < base.length; i++) {
      base[i] = (i * 7) % 256;
      result[i] = 255 - base[i];
    }
    final region = Float32List(w * h);
    for (var y = 10; y < 20; y++) {
      for (var x = 15; x < 25; x++) {
        region[y * w + x] = 1;
      }
    }
    final m = buildMasks(region, w, h, 1, 2);
    final out = pasteBack(base, result, m.soft, m.ring);
    var changed = 0;
    for (var p = 0; p < w * h; p++) {
      if (m.soft[p] == 0) {
        for (var c = 0; c < 4; c++) {
          expect(out[p * 4 + c], base[p * 4 + c]);
        }
      } else {
        changed++;
      }
    }
    expect(changed, greaterThan(100)); // the marked square and its feather did change
    expect(m.soft[15 * w + 20], 1); // the centre is fully the model's
  });

  test('dilate grows a single pixel into a square', () {
    final m = Float32List(9 * 9)..[4 * 9 + 4] = 1;
    expect(dilate(m, 9, 9, 2).where((v) => v == 1).length, 25);
  });

  test('wav header wraps PCM for /api/transcribe', () {
    final out = wav(Uint8List(32000), 16000);
    expect(String.fromCharCodes(out.sublist(0, 4)), 'RIFF');
    expect(String.fromCharCodes(out.sublist(8, 12)), 'WAVE');
    expect(out.length, 32044);
  });
}
