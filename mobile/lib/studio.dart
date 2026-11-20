// The studio: the photo full-screen, the tools along the bottom, one place to type or talk.
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'board.dart';
import 'main.dart';
import 'mic.dart';
import 'models.dart';
import 'raster.dart';
import 'sheets.dart';
import 'state.dart';
import 'turn.dart';

class Studio extends StatefulWidget {
  const Studio({super.key});
  @override
  State<Studio> createState() => _StudioState();
}

class _StudioState extends State<Studio> {
  final s = AppState.i;
  final input = TextEditingController();

  @override
  void initState() {
    super.initState();
    s.addListener(_toast);
  }

  @override
  void dispose() {
    s.removeListener(_toast);
    super.dispose();
  }

  void _toast() {
    final msg = s.toast;
    if (msg == null) return;
    s.toast = null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
    });
  }

  void send([String? text]) {
    final v = (text ?? input.text).trim();
    if (v.isEmpty) return;
    input.clear();
    runTurn(v);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: s,
      builder: (context, _) {
        final p = s.project;
        final hasImage = p?.current != null;
        return Scaffold(
          resizeToAvoidBottomInset: true,
          body: SafeArea(
            child: Column(children: [
              _TopBar(onIdeas: () => showIdeas(context)),
              Expanded(
                child: Stack(children: [
                  const Positioned.fill(child: BoardView()),
                  if (!hasImage) const Positioned.fill(child: _Empty()),
                  if (s.busy != null) Positioned(top: 10, left: 0, right: 0, child: Center(child: _Pill(text: s.busy!, spinner: true))),
                  if (s.busy == null && s.hint != null)
                    Positioned(top: 10, left: 12, right: 12, child: Center(child: _Pill(text: s.hint!, onClose: () => s.update(() => s.hint = s.awaiting = null)))),
                  if (hasImage) Positioned(left: 0, right: 0, bottom: 8, child: Center(child: s.selected != null && _selectedElement != null ? _ElementBar(e: _selectedElement!) : const _Tools())),
                ]),
              ),
              if (p != null) _LastReply(onOpen: () => showChat(context, send)),
              _Composer(input: input, onSend: send, hasImage: hasImage),
              _Dock(hasImage: hasImage, onSend: send),
            ]),
          ),
        );
      },
    );
  }

  SceneElement? get _selectedElement => s.project?.scene.elements.where((e) => e.uid == s.selected).firstOrNull;
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onIdeas});
  final VoidCallback onIdeas;
  @override
  Widget build(BuildContext context) {
    final s = AppState.i;
    return Container(
      height: 54,
      padding: const EdgeInsetsDirectional.only(start: 10, end: 2),
      decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: Color(0x14000000)))),
      child: Row(children: [
        const Wordmark(size: 16, markOnly: true),
        const SizedBox(width: 4),
        Expanded(
          child: TextButton(
            onPressed: onIdeas,
            style: TextButton.styleFrom(foregroundColor: ink, alignment: AlignmentDirectional.centerStart),
            child: Row(children: [
              Flexible(child: Text(s.project?.name ?? '…', overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
              const Icon(Icons.expand_more_rounded, size: 18),
            ]),
          ),
        ),
        if (s.demo)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: const Color(0xFFFDF4EE), borderRadius: BorderRadius.circular(20), border: Border.all(color: const Color(0xFFF6C4A2))),
            child: Text(s.t('demo'), style: const TextStyle(fontSize: 11, color: Color(0xFF8C3813), fontWeight: FontWeight.w600)),
          ),
        IconButton(visualDensity: VisualDensity.compact, tooltip: s.t('undo'), onPressed: s.canUndo ? s.undo : null, icon: const Icon(Icons.undo_rounded)),
        IconButton(visualDensity: VisualDensity.compact, tooltip: s.t('redo'), onPressed: s.canRedo ? s.redo : null, icon: const Icon(Icons.redo_rounded)),
        TextButton(style: TextButton.styleFrom(minimumSize: const Size(40, 40), padding: const EdgeInsets.symmetric(horizontal: 8)), onPressed: () => s.setLang(s.lang == 'en' ? 'ar' : 'en'), child: Text(s.lang == 'en' ? 'عربي' : 'EN')),
      ]),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  Future<void> pick(ImageSource src) async {
    final x = await ImagePicker().pickImage(source: src);
    if (x == null) return;
    try {
      await newBase(await normalizePhoto(await x.readAsBytes()), 'photo');
    } catch (e) {
      AppState.i.say('$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppState.i.t;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 400),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24), boxShadow: const [BoxShadow(color: Color(0x142A2F36), blurRadius: 30, offset: Offset(0, 10))]),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.add_photo_alternate_outlined, size: 40, color: copper),
            const SizedBox(height: 10),
            Text(t('dropTitle'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.4, height: 1.15, color: ink)),
            const SizedBox(height: 6),
            Text(t('dropSub'), textAlign: TextAlign.center, style: const TextStyle(color: muted)),
            const SizedBox(height: 18),
            SizedBox(width: double.infinity, height: 50, child: FilledButton.icon(onPressed: () => pick(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined), label: Text(t('camera')))),
            const SizedBox(height: 10),
            SizedBox(width: double.infinity, height: 50, child: OutlinedButton.icon(onPressed: () => pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: Text(t('gallery')))),
            const SizedBox(height: 18),
            Text(t('blank'), style: const TextStyle(color: muted)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              for (final a in aspects.keys) ActionChip(label: Text(a), onPressed: () async => newBase(await blankBoard(a), 'blank')),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, this.spinner = false, this.onClose});
  final String text;
  final bool spinner;
  final VoidCallback? onClose;
  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsetsDirectional.only(start: 14, end: onClose == null ? 14 : 4, top: 8, bottom: 8),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.94), borderRadius: BorderRadius.circular(22), boxShadow: const [BoxShadow(color: Color(0x1F16191D), blurRadius: 18, offset: Offset(0, 6))]),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (spinner) ...[const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)), const SizedBox(width: 10)],
          Flexible(child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, color: ink))),
          if (onClose != null) IconButton(visualDensity: VisualDensity.compact, onPressed: onClose, icon: const Icon(Icons.close_rounded, size: 18)),
        ]),
      );
}

class _Tools extends StatelessWidget {
  const _Tools();
  static const _icons = {
    Tool.select: Icons.pan_tool_alt_outlined,
    Tool.pen: Icons.gesture_rounded,
    Tool.point: Icons.adjust_rounded,
    Tool.arrow: Icons.north_east_rounded,
    Tool.text: Icons.sticky_note_2_outlined,
    Tool.eraser: Icons.cleaning_services_outlined,
  };
  @override
  Widget build(BuildContext context) {
    final s = AppState.i;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.95), borderRadius: BorderRadius.circular(18), boxShadow: const [BoxShadow(color: Color(0x1F16191D), blurRadius: 18, offset: Offset(0, 6))]),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (final e in _icons.entries)
          Tooltip(
            message: s.t(e.key.name),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => s.update(() {
                s.tool = e.key;
                s.selected = null;
              }),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                decoration: BoxDecoration(color: s.tool == e.key ? const Color(0xFFFDF4EE) : Colors.transparent, borderRadius: BorderRadius.circular(14)),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(e.value, size: 20, color: s.tool == e.key ? copper : ink),
                  const SizedBox(height: 2),
                  Text(s.t(e.key.name), style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: s.tool == e.key ? copper : muted)),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}

/// A selected element: move it with a finger; these buttons do the rest.
class _ElementBar extends StatelessWidget {
  const _ElementBar({required this.e});
  final SceneElement e;
  @override
  Widget build(BuildContext context) {
    final s = AppState.i;
    void change(void Function() fn) => s.edit((_) => fn());
    Widget b(IconData i, String tip, VoidCallback on) => IconButton(tooltip: tip, onPressed: on, icon: Icon(i, size: 20));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.96), borderRadius: BorderRadius.circular(18), boxShadow: const [BoxShadow(color: Color(0x1F16191D), blurRadius: 18, offset: Offset(0, 6))]),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Padding(padding: const EdgeInsetsDirectional.only(start: 8, end: 4), child: Text(e.name, style: const TextStyle(fontWeight: FontWeight.w600))),
        b(Icons.remove_rounded, s.t('smaller'), () => change(() {
              e.w *= 0.9;
              e.h *= 0.9;
            })),
        b(Icons.add_rounded, s.t('bigger'), () => change(() {
              e.w *= 1.1;
              e.h *= 1.1;
            })),
        b(Icons.rotate_right_rounded, s.t('rotate'), () => change(() => e.rotation = (e.rotation + 15) % 360)),
        b(Icons.flip_rounded, s.t('flip'), () => change(() {
              e.flipX = !e.flipX;
              if (e.hinge != null) e.hinge = e.hinge == 'left' ? 'right' : 'left';
            })),
        b(Icons.delete_outline_rounded, s.t('delete'), () => s.removeItem(e.uid)),
        b(Icons.check_rounded, s.t('close'), () => s.update(() => s.selected = null)),
      ]),
    );
  }
}

class _LastReply extends StatelessWidget {
  const _LastReply({required this.onOpen});
  final VoidCallback onOpen;
  @override
  Widget build(BuildContext context) {
    final s = AppState.i;
    final last = s.project!.messages.where((m) => m.role == 'agent').lastOrNull;
    if (last == null) return const SizedBox.shrink();
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Padding(padding: EdgeInsets.only(top: 2), child: Icon(Icons.auto_awesome_rounded, size: 16, color: copper)),
            const SizedBox(width: 8),
            Expanded(child: Text(last.text, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: ink, height: 1.3))),
          ]),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.input, required this.onSend, required this.hasImage});
  final TextEditingController input;
  final void Function([String?]) onSend;
  final bool hasImage;
  @override
  Widget build(BuildContext context) {
    final s = AppState.i;
    final t = s.t;
    final views = {'viewSide': 'sendSide', 'viewCut': 'sendCut', 'viewExploded': 'sendExploded', 'view3d': 'send3d'};
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (hasImage)
          SizedBox(
            height: 36,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final v in views.entries)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 6),
                  child: ActionChip(visualDensity: VisualDensity.compact, label: Text(t(v.key)), onPressed: s.busy == null ? () => onSend(t(v.value)) : null),
                ),
            ]),
          ),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
            child: TextField(
              controller: input,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
              decoration: InputDecoration(
                hintText: Mic.i.on ? t('listening') : t('say'),
                filled: true,
                fillColor: const Color(0xFFF3F4F6),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none),
              ),
            ),
          ),
          const SizedBox(width: 6),
          IconButton.filled(
            style: IconButton.styleFrom(backgroundColor: Mic.i.on ? const Color(0xFFE5262E) : copper, minimumSize: const Size(46, 46)),
            tooltip: t('say'),
            onPressed: s.busy != null && !Mic.i.on ? null : () => Mic.i.toggle((text) => onSend(text)),
            icon: Icon(Mic.i.on ? Icons.stop_rounded : Icons.mic_rounded),
          ),
          const SizedBox(width: 4),
          IconButton(tooltip: t('send'), onPressed: s.busy == null ? () => onSend() : null, icon: const Icon(Icons.send_rounded, color: copper)),
        ]),
      ]),
    );
  }
}

class _Dock extends StatelessWidget {
  const _Dock({required this.hasImage, required this.onSend});
  final bool hasImage;
  final void Function([String?]) onSend;
  @override
  Widget build(BuildContext context) {
    final s = AppState.i;
    final t = s.t;
    final p = s.project;
    final hasParent = p?.version?.parent != null;
    Widget item(IconData i, String label, VoidCallback? on) => Expanded(
          child: InkWell(
            onTap: on,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(i, color: on == null ? const Color(0xFFB5BBC3) : ink, size: 22),
                const SizedBox(height: 2),
                Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: on == null ? const Color(0xFFB5BBC3) : muted)),
              ]),
            ),
          ),
        );
    return Container(
      decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Color(0x14000000)))),
      child: Row(children: [
        item(Icons.grid_view_rounded, t('elements'), () => showElements(context)),
        item(Icons.layers_outlined, t('versions'), p != null && p.versions.isNotEmpty ? () => showVersions(context) : null),
        item(Icons.compare_rounded, t('compare'), hasParent ? () => showCompare(context) : null),
        item(Icons.chat_bubble_outline_rounded, t('chat'), () => showChat(context, onSend)),
        item(Icons.ios_share_rounded, t('export'), hasImage ? () => showShare(context) : null),
      ]),
    );
  }
}
