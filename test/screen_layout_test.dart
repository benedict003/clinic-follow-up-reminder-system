// Guards against the bug class that froze the web build: any exception thrown
// during layout leaves the Scaffold (and its slivers) partially laid out, and
// every later pointer event then dies in hit-testing, so the whole app stops
// responding while still painting.
//
// The original case: AppTheme set `minimumSize: Size.fromHeight(48)` (minWidth
// = infinity) and a FilledButton sat inside a Row, where the width is
// unbounded. Layout threw "BoxConstraints forces an infinite width" on the
// Secure exchange screen and nothing on the page could be tapped afterwards.
//
// Run with: flutter test test/screen_layout_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:clinic_follow_up_reminder_system/screens/home_shell.dart';
import 'package:clinic_follow_up_reminder_system/screens/follow_up_detail_screen.dart';
import 'package:clinic_follow_up_reminder_system/screens/login_screen.dart';
import 'package:clinic_follow_up_reminder_system/screens/patients_screen.dart';
import 'package:clinic_follow_up_reminder_system/screens/secure_exchange_screen.dart';
import 'package:clinic_follow_up_reminder_system/screens/settings_screen.dart';
import 'package:clinic_follow_up_reminder_system/theme/app_theme.dart';

void main() {
  /// Layout and hit-test a screen at both capture widths (the module report
  /// uses 1280x800 and 380x800) and fail on any framework error.
  Future<void> expectCleanBuild(
    WidgetTester tester,
    String label,
    Widget home,
    Size size,
  ) async {
    final List<String> errors = <String>[];
    final void Function(FlutterErrorDetails)? previous = FlutterError.onError;
    FlutterError.onError = (FlutterErrorDetails d) => errors.add(d.exceptionAsString());

    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: home));
    for (int i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
    // Touch several points: hit-testing is where an unlaid-out render object
    // surfaces as a user-visible freeze.
    for (final Offset point in <Offset>[
      const Offset(40, 40),
      const Offset(200, 300),
      const Offset(600, 500),
    ]) {
      await tester.tapAt(point);
      await tester.pump(const Duration(milliseconds: 60));
    }

    FlutterError.onError = previous;
    expect(errors, isEmpty,
        reason: '$label at ${size.width.toInt()}x${size.height.toInt()}');
  }

  for (final Size size in <Size>[const Size(1280, 800), const Size(380, 800)]) {
    testWidgets('secure exchange lays out and hit-tests at ${size.width.toInt()}',
        (WidgetTester tester) async {
      await expectCleanBuild(tester, 'secure exchange', const SecureExchangeScreen(), size);
    });

    testWidgets('server & session lays out and hit-tests at ${size.width.toInt()}',
        (WidgetTester tester) async {
      await expectCleanBuild(tester, 'settings', const SettingsScreen(), size);
    });

    testWidgets('shell lays out and hit-tests at ${size.width.toInt()}',
        (WidgetTester tester) async {
      await expectCleanBuild(tester, 'shell', HomeShell(onSignOut: () {}), size);
    });

    testWidgets('follow-up record lays out at ${size.width.toInt()}', (WidgetTester tester) async {
      await expectCleanBuild(tester, 'follow-up detail', const FollowUpDetailScreen(followUpId: 1), size);
    });

    testWidgets('patient register lays out at ${size.width.toInt()}', (WidgetTester tester) async {
      await expectCleanBuild(tester, 'patients', const PatientsScreen(), size);
    });

    testWidgets('login lays out and hit-tests at ${size.width.toInt()}',
        (WidgetTester tester) async {
      await expectCleanBuild(tester, 'login', LoginScreen(onSignedIn: () {}), size);
    });
  }
}
