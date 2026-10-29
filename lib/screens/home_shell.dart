// lib/screens/home_shell.dart
import 'package:flutter/material.dart';

import '../api/clinic_api.dart';
import 'follow_ups_screen.dart';
import 'home_screen.dart';
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

  @override
  Widget build(BuildContext context) {
    final titles = ['Overview', 'Follow-ups', 'Reminders', 'More'];
    final screens = <Widget>[
      HomeScreen(onOpenTab: (i) => setState(() => _index = i)),
      const FollowUpsScreen(),
      const RemindersScreen(),
      MoreScreen(onSignOut: widget.onSignOut),
    ];
    final safe = _index.clamp(0, screens.length - 1);

    return Scaffold(
      appBar: AppBar(
        title: Text(titles[safe]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text('${ClinicApi.instance.displayName} · ${ClinicApi.instance.role}',
                  style: const TextStyle(color: Colors.white70, fontSize: 11)),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: safe, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safe,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.event_repeat), label: 'Follow-ups'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), label: 'Reminders'),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}