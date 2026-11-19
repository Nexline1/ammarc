import 'package:ammarc/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<String?> enter(WidgetTester t, String text) async {
    String? got;
    await t.pumpWidget(MaterialApp(home: Setup(onDone: (u) => got = u)));
    await t.enterText(find.byType(TextField), text);
    await t.tap(find.text('Open'));
    await t.pump();
    return got;
  }

  testWidgets('a bare host gets https://', (t) async => expect(await enter(t, 'ammarc.onrender.com'), 'https://ammarc.onrender.com'));
  testWidgets('a full address is kept', (t) async => expect(await enter(t, 'http://10.0.2.2:5180'), 'http://10.0.2.2:5180'));
  testWidgets('junk is refused with a message', (t) async {
    expect(await enter(t, 'https://'), isNull);
    expect(find.textContaining("doesn't look like"), findsOneWidget);
  });
}
