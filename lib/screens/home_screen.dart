// lib/screens/home_screen.dart
import 'package:flutter/material.dart';

import '../api/clinic_api.dart';
import '../api/reminder_api.dart';
import '../widgets/ui.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onOpenTab});
  final ValueChanged<int> onOpenTab;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<Map<String, dynamic>> _future = _load();

  Future<Map<String, dynamic>> _load() async {
    final jobs = await ReminderApi.instance.jobs();
    final followUps = await ReminderApi.instance.followUps();
    int escalations = 0;
    try {
      final waiting = await ReminderApi.instance.jobs(status: 'needs_human');
      escalations = (waiting['unreadAlerts'] as num?)?.toInt()
          ?? ((waiting['jobs'] as List?)?.length ?? 0);
    } catch (_) {
      escalations = 0;
    }
    final counts = (jobs['counts'] as Map?)?.cast<String, dynamic>() ?? const {};
    return {
      'counts': counts,
      'followUps': followUps.length,
      'escalations': escalations,
    };
  }

  void _reload() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) return ErrorView(error: snap.error!, onRetry: _reload);

          final data = snap.data!;
          final counts = (data['counts'] as Map).cast<String, dynamic>();
          final escalations = data['escalations'] as int;

          Widget tile(String label, String value, IconData icon) => Card(
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Icon(icon, color: t.colorScheme.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(value, style: t.textTheme.headlineSmall),
                        Text(label, style: t.textTheme.labelSmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                color: t.colorScheme.primary,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16)),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      const Icon(Icons.event_repeat, color: Colors.white, size: 34),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Clinic Follow-Up Reminders',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600)),
                            Text('${ClinicApi.instance.displayName} · '
                                '${ClinicApi.instance.role}',
                                style: const TextStyle(
                                    color: Colors.white70, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 2.0,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                children: [
                  tile('Queued', '${counts['queued'] ?? 0}', Icons.schedule),
                  tile('Succeeded', '${counts['succeeded'] ?? 0}', Icons.check_circle_outline),
                  tile('Needs a human', '${counts['needs_human'] ?? 0}',
                      Icons.report_problem_outlined),
                  tile('Follow-ups', '${data['followUps']}', Icons.list_alt),
                ],
              ),
              const SizedBox(height: 12),
              Card(
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                child: ListTile(
                  leading: Icon(Icons.sync_problem,
                      color: escalations > 0 ? t.colorScheme.error : null),
                  title: const Text('Automation escalations'),
                  subtitle: Text(escalations > 0
                      ? '$escalations job(s) need a doctor'
                      : 'Nothing needs attention'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => widget.onOpenTab(2),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}