// The same contract as shared/types.ts on the server. Plans stay raw JSON: the app only reads a few fields
// and passes the rest straight back to /api/render.
typedef Json = Map<String, dynamic>;
typedef Pt = List<double>; // [x, y] in base-image pixels

List<Pt> _pts(List l) => [for (final p in l) [(p[0] as num).toDouble(), (p[1] as num).toDouble()]];

class SceneElement {
  SceneElement({required this.uid, required this.kind, required this.ref, required this.name, required this.prompt, required this.x, required this.y, required this.w, required this.h, this.rotation = 0, this.flipX = false, this.hinge, this.sizeCm, required this.url});
  final String uid, kind, ref, name, prompt, url;
  double x, y, w, h, rotation;
  bool flipX;
  String? hinge;
  List<double>? sizeCm;

  factory SceneElement.fromJson(Json j) => SceneElement(
        uid: j['uid'], kind: j['kind'], ref: j['ref'], name: j['name'], prompt: j['prompt'], url: j['url'],
        x: (j['x'] as num).toDouble(), y: (j['y'] as num).toDouble(), w: (j['w'] as num).toDouble(), h: (j['h'] as num).toDouble(),
        rotation: (j['rotation'] as num).toDouble(), flipX: j['flipX'] as bool, hinge: j['hinge'],
        sizeCm: j['sizeCm'] == null ? null : [for (final v in j['sizeCm']) (v as num).toDouble()],
      );
  Json toJson() => {'uid': uid, 'kind': kind, 'ref': ref, 'name': name, 'prompt': prompt, 'x': x, 'y': y, 'w': w, 'h': h, 'rotation': rotation, 'flipX': flipX, 'hinge': hinge, 'sizeCm': sizeCm, 'url': url};
}

class Mark {
  Mark({required this.uid, required this.type, required this.points, this.text});
  final String uid, type; // pen | point | arrow | dimension | text
  final List<Pt> points;
  String? text;
  factory Mark.fromJson(Json j) => Mark(uid: j['uid'], type: j['type'], points: _pts(j['points']), text: j['text']);
  Json toJson() => {'uid': uid, 'type': type, 'points': points, if (text != null) 'text': text};
}

class Scene {
  Scene({List<SceneElement>? elements, List<Mark>? marks, this.pxPerCm}) : elements = elements ?? [], marks = marks ?? [];
  final List<SceneElement> elements;
  final List<Mark> marks;
  double? pxPerCm;
  factory Scene.fromJson(Json j) => Scene(
        elements: [for (final e in j['elements'] as List) SceneElement.fromJson(e)],
        marks: [for (final m in j['marks'] as List) Mark.fromJson(m)],
        pxPerCm: (j['scale']?['pxPerCm'] as num?)?.toDouble(),
      );
  Json toJson() => {'elements': [for (final e in elements) e.toJson()], 'marks': [for (final m in marks) m.toJson()], if (pxPerCm != null) 'scale': {'pxPerCm': pxPerCm}};
}

class Version {
  Version({required this.id, required this.file, required this.note, this.parent, required this.at});
  final String id, file, note;
  final String? parent;
  final int at;
  factory Version.fromJson(Json j) => Version(id: j['id'], file: j['file'], note: j['note'], parent: j['parent'], at: (j['at'] as num).toInt());
  Json toJson() => {'id': id, 'file': file, 'note': note, 'parent': parent, 'at': at};
}

class Chip2 {
  Chip2(this.label, this.send);
  final String label, send;
}

class Message {
  Message({required this.id, required this.role, required this.text, this.chips, this.rule, this.fix});
  final String id, role, text;
  final List<Chip2>? chips;
  final String? rule, fix;
  factory Message.fromJson(Json j) => Message(
        id: j['id'], role: j['role'], text: j['text'], rule: j['rule'], fix: j['fix'],
        chips: j['chips'] == null ? null : [for (final c in j['chips']) Chip2(c['label'], c['send'])],
      );
  Json toJson() => {
        'id': id, 'role': role, 'text': text,
        if (chips != null) 'chips': [for (final c in chips!) {'label': c.label, 'send': c.send}],
        if (rule != null) 'rule': rule, if (fix != null) 'fix': fix,
      };
}

class Project {
  Project({required this.id, required this.name, required this.updatedAt, List<Version>? versions, this.current, Scene? scene, List<Message>? messages, this.pitch})
      : versions = versions ?? [], scene = scene ?? Scene(), messages = messages ?? [];
  final String id;
  String name;
  int updatedAt;
  final List<Version> versions;
  String? current;
  Scene scene;
  final List<Message> messages;
  Json? pitch; // kept as-is so the web app's proposal deck still finds it

  Version? get version => versions.where((v) => v.id == current).firstOrNull;
  factory Project.fromJson(Json j) => Project(
        id: j['id'], name: j['name'], updatedAt: (j['updatedAt'] as num).toInt(), current: j['current'],
        versions: [for (final v in j['versions'] as List) Version.fromJson(v)],
        scene: Scene.fromJson(j['scene']),
        messages: [for (final m in j['messages'] as List) Message.fromJson(m)],
        pitch: j['pitch'],
      );
  Json toJson() => {
        'id': id, 'name': name, 'updatedAt': updatedAt, 'current': current,
        'versions': [for (final v in versions) v.toJson()], 'scene': scene.toJson(),
        'messages': [for (final m in messages) m.toJson()], if (pitch != null) 'pitch': pitch,
      };
  Project copy() => Project.fromJson(toJson());
}

class ProjectSummary {
  ProjectSummary(this.id, this.name, this.updatedAt, this.thumb);
  final String id, name;
  final int updatedAt;
  final String? thumb;
  factory ProjectSummary.fromJson(Json j) => ProjectSummary(j['id'], j['name'], (j['updatedAt'] as num).toInt(), j['thumb']);
}

class CatalogItem {
  CatalogItem(this.id, this.cat, this.en, this.ar, this.syn, this.size, this.hinge, this.prompt);
  final String id, cat, en, ar, prompt;
  final List<String> syn;
  final List<double> size;
  final String? hinge;
  factory CatalogItem.fromJson(Json j) => CatalogItem(j['id'], j['cat'], j['en'], j['ar'], [for (final s in j['syn']) s as String], [for (final v in j['size']) (v as num).toDouble()], j['hinge'], j['prompt']);
}
