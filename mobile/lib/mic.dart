// Tap to talk: 16 kHz mono PCM from the mic, wrapped as WAV, sent to /api/transcribe. Works the same on
// Android and in the iPhone home-screen app, with no files on disk.
import 'dart:async';
import 'dart:typed_data';

import 'package:record/record.dart';

import 'api.dart';
import 'state.dart';

class Mic {
  Mic._();
  static final Mic i = Mic._();
  final _rec = AudioRecorder();
  StreamSubscription<Uint8List>? _sub;
  final _pcm = BytesBuilder(copy: false);
  bool get on => _sub != null;

  Future<void> toggle(void Function(String text) onText) async {
    final s = AppState.i;
    if (on) {
      await _rec.stop();
      await _sub?.cancel();
      _sub = null;
      s.update();
      final pcm = _pcm.takeBytes();
      if (pcm.length < 16000) return; // under half a second: a mis-tap
      s.update(() => s.busy = '…');
      try {
        onText(await Api.i.transcribe(wav(pcm, 16000), 'audio/wav', s.lang));
      } catch (e) {
        s.say('$e');
      } finally {
        s.update(() => s.busy = null);
      }
      return;
    }
    if (!await _rec.hasPermission()) return s.say(s.t('micDenied'));
    try {
      final stream = await _rec.startStream(const RecordConfig(encoder: AudioEncoder.pcm16bits, sampleRate: 16000, numChannels: 1));
      _pcm.clear();
      _sub = stream.listen(_pcm.add);
      s.update();
    } catch (_) {
      s.say(s.t('micDenied'));
    }
  }
}

/// 44-byte RIFF header in front of 16-bit little-endian mono PCM.
Uint8List wav(Uint8List pcm, int rate) {
  final h = ByteData(44);
  void str(int at, String v) {
    for (var i = 0; i < v.length; i++) {
      h.setUint8(at + i, v.codeUnitAt(i));
    }
  }

  str(0, 'RIFF');
  h.setUint32(4, 36 + pcm.length, Endian.little);
  str(8, 'WAVE');
  str(12, 'fmt ');
  h.setUint32(16, 16, Endian.little);
  h.setUint16(20, 1, Endian.little); // PCM
  h.setUint16(22, 1, Endian.little); // mono
  h.setUint32(24, rate, Endian.little);
  h.setUint32(28, rate * 2, Endian.little);
  h.setUint16(32, 2, Endian.little);
  h.setUint16(34, 16, Endian.little);
  str(36, 'data');
  h.setUint32(40, pcm.length, Endian.little);
  return (BytesBuilder()..add(h.buffer.asUint8List())..add(pcm)).takeBytes();
}
