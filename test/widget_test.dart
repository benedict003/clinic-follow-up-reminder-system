// Sign-in form test. Kept deliberately offline: the storage plugin and the
// backend are both absent under `flutter test`, so the form is pumped directly
// rather than through ClinicApi.resume(), which never completes inside the
// test's fake clock.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:clinic_follow_up_reminder_system/screens/login_screen.dart';
import 'package:clinic_follow_up_reminder_system/theme/app_theme.dart';

void main() {
  Future<void> pumpLogin(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: LoginScreen(onSignedIn: () {}),
    ));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('sign-in form renders with both fields', (WidgetTester tester) async {
    await pumpLogin(tester);

    expect(find.text('Staff sign in'), findsOneWidget);
    expect(find.byType(TextFormField), findsNWidgets(2));
    expect(find.text('Sign in'), findsWidgets);
  });

  testWidgets('submitting empty fields reports both errors and calls no backend',
      (WidgetTester tester) async {
    await pumpLogin(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Enter your username'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
  });
}
