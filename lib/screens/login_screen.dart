import 'package:flutter/material.dart';

import '../api/clinic_api.dart';
import '../config/app_config.dart';
import '../theme/app_theme.dart';
import 'settings_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onSignedIn});
  final VoidCallback onSignedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ClinicApi.instance.login(_username.text, _password.text);
      if (!mounted) return;
      widget.onSignedIn();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Palette.teal, Palette.tealDeep],
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.event_repeat, size: 64, color: Colors.white),
                      const SizedBox(height: 12),
                      const Text(
                        'Clinic Follow-Up Reminders',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w700),
                      ),
                      const Text(
                        'Automated reminder workflow',
                        style: TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                      const SizedBox(height: 22),
                      Card(
                        elevation: 8,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                          child: Form(
                            key: _form,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Row(children: [
                                  Icon(Icons.lock_outline, size: 20, color: Palette.teal),
                                  const SizedBox(width: 8),
                                  Text('Staff sign in',
                                      style: t.textTheme.titleMedium
                                          ?.copyWith(fontWeight: FontWeight.w600)),
                                ]),
                                const SizedBox(height: 16),
                                TextFormField(
                                  controller: _username,
                                  autocorrect: false,
                                  textInputAction: TextInputAction.next,
                                  decoration: const InputDecoration(
                                    labelText: 'Username',
                                    prefixIcon: Icon(Icons.person_outline),
                                    border: OutlineInputBorder(),
                                  ),
                                  validator: (v) =>
                                  (v == null || v.trim().isEmpty) ? 'Enter your username' : null,
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  controller: _password,
                                  obscureText: _obscure,
                                  textInputAction: TextInputAction.done,
                                  onFieldSubmitted: (_) => _submit(),
                                  decoration: InputDecoration(
                                    labelText: 'Password',
                                    prefixIcon: const Icon(Icons.lock_outline),
                                    border: const OutlineInputBorder(),
                                    suffixIcon: IconButton(
                                      onPressed: () => setState(() => _obscure = !_obscure),
                                      icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                                    ),
                                  ),
                                  validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                                ),
                                const SizedBox(height: 18),
                                FilledButton(
                                  onPressed: _busy ? null : _submit,
                                  child: _busy
                                      ? const SizedBox(
                                      height: 20, width: 20,
                                      child: CircularProgressIndicator(strokeWidth: 2))
                                      : const Text('Sign in'),
                                ),
                                if (_error != null) ...[
                                  const SizedBox(height: 14),
                                  Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: t.colorScheme.errorContainer,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Text(_error!, style: t.textTheme.bodySmall),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextButton.icon(
                        onPressed: () async {
                          await Navigator.of(context).push(MaterialPageRoute(
                              builder: (_) => const SettingsScreen(embedded: true)));
                          if (mounted) setState(() {});
                        },
                        icon: const Icon(Icons.dns_outlined, size: 18, color: Colors.white70),
                        label: Text(ClinicApi.instance.baseUrl,
                            style: const TextStyle(color: Colors.white70)),
                      ),
                      Text('Backend port ${AppConfig.port}',
                          style: const TextStyle(color: Colors.white38, fontSize: 11)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}