// lib/main.dart
import 'package:flutter/material.dart';

import 'api/clinic_api.dart';
import 'app_routes.dart';
import 'screens/follow_up_detail_screen.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'screens/secure_exchange_screen.dart';
import 'screens/settings_screen.dart';
import 'theme/app_theme.dart';

void main() {
  // A widget that throws would otherwise paint an empty grey area that eats
  // every tap - indistinguishable from a hang. Show the failure instead.
  ErrorWidget.builder = (FlutterErrorDetails details) => _BuildFailure(details);
  runApp(const ClinicApp());
}

class ClinicApp extends StatefulWidget {
  const ClinicApp({super.key});
  @override
  State<ClinicApp> createState() => _ClinicAppState();
}

class _ClinicAppState extends State<ClinicApp> {
  /// Lets a 401 unwind pushed pages from anywhere in the app.
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

  late final Future<bool> _boot;
  bool _signedIn = false;

  @override
  void initState() {
    super.initState();
    ClinicApi.instance.onSessionExpired = _handleSessionExpired;
    _boot = ClinicApi.instance.resume().then((ok) {
      if (mounted) setState(() => _signedIn = ok);
      return ok;
    });
  }

  /// A 401 used to flip the root to the login screen while whichever page was
  /// pushed on top stayed there, one dead request away from an unusable tab.
  /// Unwind to the root first, then show the login screen.
  void _handleSessionExpired() {
    if (!mounted) return;
    _navigatorKey.currentState?.popUntil((Route<dynamic> route) => route.isFirst);
    if (_signedIn) setState(() => _signedIn = false);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Clinic Follow-Up Reminders',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      navigatorKey: _navigatorKey,
      // Pushed pages are named so the browser URL, the history stack and the
      // back button all agree. Hash strategy (the default) keeps these working
      // when the release build is served from /app/ by the backend.
      routes: <String, WidgetBuilder>{
        AppRoutes.serverSetup: (_) => const SettingsScreen(embedded: true),
        AppRoutes.settings: (_) => const SettingsScreen(),
        AppRoutes.secureExchange: (_) => const SecureExchangeScreen(),
      },
      // The follow-up record needs its id, so it is resolved here rather than in
      // the routes map. The path stays /follow-up, so the browser back button
      // still returns to the list.
      onGenerateRoute: (RouteSettings settings) {
        if (settings.name != AppRoutes.followUp) return null;
        final Object? args = settings.arguments;
        final int? id = args is int ? args : int.tryParse('$args');
        if (id == null) return null;
        return MaterialPageRoute<void>(
          settings: settings,
          builder: (_) => FollowUpDetailScreen(followUpId: id),
        );
      },
      home: FutureBuilder<bool>(
        future: _boot,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          if (_signedIn) {
            return HomeShell(onSignOut: () => setState(() => _signedIn = false));
          }
          return LoginScreen(onSignedIn: () => setState(() => _signedIn = true));
        },
      ),
    );
  }
}

/// Replacement for the default grey error box, which is unreadable and looks
/// exactly like a frozen page.
class _BuildFailure extends StatelessWidget {
  const _BuildFailure(this.details);
  final FlutterErrorDetails details;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFDECEA),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Text(
            'This part of the screen failed to draw.\n\n'
            '${details.exceptionAsString()}',
            style: const TextStyle(
              color: Color(0xFF8A1C1C),
              fontSize: 12,
              fontFamily: 'monospace',
            ),
          ),
        ),
      ),
    );
  }
}
