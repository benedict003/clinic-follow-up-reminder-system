// lib/screens/widgets_placeholder.dart
import 'package:flutter/material.dart';

import '../api/clinic_api.dart';
import 'settings_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key, required this.onSignOut});
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final api = ClinicApi.instance;
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        ListTile(
          leading: const Icon(Icons.verified_user_outlined),
          title: Text(api.displayName),
          subtitle: Text('${api.role} · @${api.user?['username']}'),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.dns_outlined),
          title: const Text('Server & session'),
          subtitle: Text(api.baseUrl),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SettingsScreen()),
          ),
        ),
        const Divider(),
        ListTile(
          leading: Icon(Icons.logout, color: Theme.of(context).colorScheme.error),
          title: const Text('Sign out'),
          onTap: () async {
            await ClinicApi.instance.signOut();
            onSignOut();
          },
        ),
      ],
    );
  }
}