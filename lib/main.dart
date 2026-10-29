// lib/main.dart
import 'package:flutter/material.dart';

import 'api/clinic_api.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'theme/app_theme.dart';

void main() => runApp(const ClinicApp());

class ClinicApp extends StatefulWidget {
  const ClinicApp({super.key});
  @override
  State<ClinicApp> createState() => _ClinicAppState();
}

class _ClinicAppState extends State<ClinicApp> {
  late final Future<bool> _boot;
  bool _signedIn = false;

  @override
  void initState() {
    super.initState();
    ClinicApi.instance.onSessionExpired = () {
      if (!mounted || !_signedIn) return;
      setState(() => _signedIn = false);
    };
    _boot = ClinicApi.instance.resume().then((ok) {
      if (mounted) setState(() => _signedIn = ok);
      return ok;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Clinic Follow-Up Reminders',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
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