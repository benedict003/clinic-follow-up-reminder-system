// lib/screens/home_shell.dart
import 'package:flutter/material.dart';

import '../api/clinic_api.dart';
import '../app_routes.dart';
import 'follow_ups_screen.dart';
import 'home_screen.dart';
import 'patients_screen.dart';
import 'reminders_screen.dart';
import 'widgets_placeholder.dart' show MoreScreen;

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.onSignOut});
  final VoidCallback onSignOut;
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  /// Set when the worklist sends the user to a specific filter. FollowUpsScreen
  /// applies it in didUpdateWidget, so tapping "Overdue" twice still works.
  String? _followUpScope;
  int _scopeSeq = 0;

  void _openFollowUps(String scope) {
    setState(() {
      _followUpScope = scope;
      _scopeSeq++; // a new value even for the same scope, so it re-applies
      _index = 1;
    });
  }

  void _openFollowUp(int id) {
    Navigator.of(context).pushNamed(AppRoutes.followUp, arguments: id);
  }

  @override
  Widget build(BuildContext context) {
    final List<String> titles = <String>[
      'Overview',
      'Follow-ups',
      'Reminders',
      'Patients',
      'More',
    ];
    final List<Widget> screens = <Widget>[
      HomeScreen(
        onOpenTab: (int i) => setState(() => _index = i),
        onOpenFollowUps: _openFollowUps,
        onOpenFollowUp: _openFollowUp,
      ),
      FollowUpsScreen(
        key: ValueKey<int>(_scopeSeq),
        initialScope: _followUpScope,
      ),
      const RemindersScreen(),
      const PatientsScreen(),
      MoreScreen(onSignOut: widget.onSignOut),
    ];
    final int safe = _index.clamp(0, screens.length - 1);

    return Scaffold(
      appBar: AppBar(
        title: Text(titles[safe]),
        actions: <Widget>[
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text(
                '${ClinicApi.instance.displayName} · ${ClinicApi.instance.role}',
                style: const TextStyle(color: Colors.white70, fontSize: 11),
              ),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: safe, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safe,
        onDestinationSelected: (int i) => setState(() => _index = i),
        destinations: const <NavigationDestination>[
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.event_repeat), label: 'Follow-ups'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), label: 'Reminders'),
          NavigationDestination(icon: Icon(Icons.people_outline), label: 'Patients'),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}
