// lib/widgets/ui.dart
import 'package:flutter/material.dart';

import '../theme/app_theme.dart';




class LoadingView extends StatelessWidget {
  const LoadingView({super.key});
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 48),
        Icon(Icons.cloud_off, size: 48, color: t.colorScheme.error),
        const SizedBox(height: 12),
        Text('$error', textAlign: TextAlign.center, style: t.textTheme.bodyMedium),
        if (onRetry != null) ...[
          const SizedBox(height: 16),
          Center(
            child: FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ),
        ],
      ],
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.message, this.icon = Icons.inbox_outlined});
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 64),
        Icon(icon, size: 48, color: t.colorScheme.outline),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center, style: t.textTheme.bodyMedium),
      ],
    );
  }
}

void showError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text('$error')));
}

String dash(Object? v) {
  final s = v?.toString().trim() ?? '';
  return s.isEmpty ? '—' : s;
}

PreferredSizeWidget appBar(String title, {List<Widget>? actions, PreferredSizeWidget? bottom}) {
  return AppBar(
    title: Text(title),
    actions: actions,
    bottom: bottom,
  );
}

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (Color color, IconData icon) = switch (status) {
      'succeeded' => (Colors.green, Icons.check_circle),
      'needs_human' => (Palette.accent, Icons.report_problem),
      'running' => (Colors.blue, Icons.hourglass_bottom),
      'obsolete' => (Colors.blueGrey, Icons.archive_outlined),
      'reminded' => (Palette.teal, Icons.notifications_active),
      'scheduled' => (Colors.grey, Icons.schedule),
      'closed' => (Colors.blueGrey, Icons.lock_outline),
      _ => (Colors.grey, Icons.schedule),
    };
    return CircleAvatar(
      radius: 16,
      backgroundColor: color.withValues(alpha: 0.15),
      child: Icon(icon, size: 18, color: color),
    );
  }
}