// lib/screens/settings_screen.dart
import 'package:flutter/material.dart';

import 'secure_exchange_screen.dart';

import '../api/clinic_api.dart';
import '../config/app_config.dart';
import '../widgets/ui.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, this.embedded = false});
  final bool embedded;
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _url =
  TextEditingController(text: ClinicApi.instance.baseUrl);
  bool _busy = false;
  String? _message;
  bool _ok = false;

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _test() async {
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final summary = await ClinicApi.instance.probe(_url.text);
      if (!mounted) return;
      setState(() {
        _ok = true;
        _message = summary;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _ok = false;
        _message = '$e';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final body = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _url,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: 'API base URL',
            prefixIcon: Icon(Icons.dns_outlined),
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 8, children: [
          ActionChip(
            avatar: const Icon(Icons.desktop_windows_outlined, size: 16),
            label: const Text('localhost'),
            onPressed: () =>
                setState(() => _url.text = 'http://localhost:${AppConfig.port}'),
          ),
          ActionChip(
            avatar: const Icon(Icons.smartphone, size: 16),
            label: const Text('Emulator 10.0.2.2'),
            onPressed: () =>
                setState(() => _url.text = 'http://10.0.2.2:${AppConfig.port}'),
          ),
        ]),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: _busy ? null : _test,
              icon: _busy
                  ? const SizedBox(
                  height: 16, width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.bolt),
              label: Text(_busy ? 'Testing…' : 'Test connection'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: OutlinedButton(
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                final navigator = Navigator.of(context);
                await ClinicApi.instance.setBaseUrl(_url.text);
                messenger.showSnackBar(
                    const SnackBar(content: Text('Server saved.')));
                if (widget.embedded && navigator.canPop()) navigator.pop();
              },
              child: const Text('Save'),
            ),
          ),
        ]),
        if (_message != null) ...[
          const SizedBox(height: 16),
          Card(
            color: _ok ? t.colorScheme.primaryContainer : t.colorScheme.errorContainer,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(children: [
                Icon(_ok ? Icons.check_circle_outline : Icons.cloud_off),
                const SizedBox(width: 10),
                Expanded(child: Text(_message!, style: const TextStyle(fontSize: 12))),
              ]),
            ),
          ),
        ],
        const Divider(height: 32),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.verified_user_outlined),
          title: const Text('Session'),
          subtitle: Text(ClinicApi.instance.signedIn
              ? 'Signed in as ${ClinicApi.instance.displayName} '
              '(${ClinicApi.instance.role})'
              : 'Not signed in'),
        ),
        ListTile(
          leading: const Icon(Icons.lock_outline),
          title: const Text('Secure exchange'),
          subtitle: const Text('Seal a minimised record and send it to the partner'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => const SecureExchangeScreen(),
            ),
          ),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.info_outline),
          title: const Text('Build'),
          subtitle: const Text('Flutter Web · release · demo'),
        ),
      ],
    );

    return Scaffold(
      appBar: appBar(widget.embedded ? 'Server' : 'Server & session'),
      body: body,
    );
  }
}