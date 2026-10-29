// lib/screens/reminders_screen.dart
import 'package:flutter/material.dart';

import '../api/clinic_api.dart';
import '../api/reminder_api.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

class RemindersScreen extends StatefulWidget {
  const RemindersScreen({super.key});
  @override
  State<RemindersScreen> createState() => _RemindersScreenState();
}

class _RemindersScreenState extends State<RemindersScreen> {
  static const _filters = ['', 'queued', 'running', 'succeeded', 'needs_human', 'obsolete'];
  String _filter = '';
  late Future<Map<String, dynamic>> _future;
  int? _selectedId;

  @override
  void initState() {
    super.initState();
    _future = ReminderApi.instance.jobs();
  }

  void _reload() =>
      setState(() => _future = ReminderApi.instance.jobs(status: _filter));

  static String _label(String s) => s
      .split('_')
      .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
      .join(' ');

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.of(context).size.width >= 720;

    return Scaffold(
      appBar: appBar('Reminder jobs', actions: [
        IconButton(
          tooltip: 'Queue a due follow-up',
          icon: const Icon(Icons.add),
          onPressed: _openQueue,
        ),
        IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh), onPressed: _reload),
      ]),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              children: [
                for (final f in _filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(f.isEmpty ? 'All' : _label(f)),
                      selected: _filter == f,
                      onSelected: (_) {
                        _filter = f;
                        _reload();
                      },
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => _reload(),
              child: FutureBuilder<Map<String, dynamic>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const LoadingView();
                  }
                  if (snap.hasError) {
                    return ErrorView(error: snap.error!, onRetry: _reload);
                  }
                  final rows = (snap.data!['jobs'] as List?) ?? const [];
                  if (rows.isEmpty) {
                    return const EmptyView(
                      message: 'No reminder jobs yet.\n'
                          'Use + to queue a follow-up that is due today.',
                      icon: Icons.notifications_none,
                    );
                  }
                  final jobs = rows
                      .map((e) => ReminderJob((e as Map).cast<String, dynamic>()))
                      .toList();

                  final list = ListView.builder(
                    padding: const EdgeInsets.only(bottom: 16),
                    itemCount: jobs.length,
                    itemBuilder: (context, i) {
                      final j = jobs[i];
                      return Material(
                        color: _selectedId == j.id
                            ? Colors.white
                            : Colors.white.withValues(alpha: 0.75),
                        child: ListTile(
                          leading: StatusChip(status: j.status),
                          title: Text('Job #${j.id} · ${dash(j.patientName)}'),
                          subtitle: Text('follow-up #${j.followUpId} · '
                              '${j.attempts}/${j.maxAttempts} · '
                              '${j.lastErrorCode ?? 'no error'}'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () async {
                            setState(() => _selectedId = j.id);
                            if (!wide) {
                              await Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) =>
                                    ReminderDetailPage(jobId: j.id, onChanged: _reload),
                              ));
                            }
                          },
                        ),
                      );
                    },
                  );

                  if (!wide) return list;

                  return Row(children: [
                    Expanded(flex: 4, child: list),
                    const VerticalDivider(width: 1),
                    Expanded(
                      flex: 6,
                      child: _selectedId == null
                          ? const Center(child: Text('Select a job'))
                          : ReminderDetailPane(jobId: _selectedId!, onChanged: _reload),
                    ),
                  ]);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openQueue() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => const QueueReminderDialog(),
    );
    if (ok == true) _reload();
  }
}

class ReminderDetailPage extends StatelessWidget {
  const ReminderDetailPage({super.key, required this.jobId, required this.onChanged});
  final int jobId;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Job #$jobId'),
      body: ReminderDetailPane(jobId: jobId, onChanged: onChanged),
    );
  }
}

class ReminderDetailPane extends StatefulWidget {
  const ReminderDetailPane({super.key, required this.jobId, required this.onChanged});
  final int jobId;
  final VoidCallback onChanged;

  @override
  State<ReminderDetailPane> createState() => _ReminderDetailPaneState();
}

class _ReminderDetailPaneState extends State<ReminderDetailPane> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = ReminderApi.instance.job(widget.jobId);
  }

  void _reload() => setState(() => _future = ReminderApi.instance.job(widget.jobId));

  Future<void> _retry() async {
    final reason = await showDialog<String>(
      context: context,
      builder: (_) => const ReasonDialog(),
    );
    if (reason == null || reason.trim().length < 8) return;
    if (!mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ReminderApi.instance.retry(widget.jobId, reason.trim());
      messenger.showSnackBar(const SnackBar(content: Text('Job re-queued.')));
      if (!mounted) return;
      _reload();
      widget.onChanged();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _acknowledge() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ReminderApi.instance.acknowledge(widget.jobId);
      if (!mounted) return;
      _reload();
      widget.onChanged();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final isDoctor = ClinicApi.instance.isDoctor;

    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) return ErrorView(error: snap.error!, onRetry: _reload);

        final job = ReminderJob((snap.data!['job'] as Map).cast<String, dynamic>());
        final attempts = (snap.data!['attempts'] as List?) ?? const [];
        final alerts = (snap.data!['alerts'] as List?) ?? const [];
        final needsHuman = job.status == 'needs_human';

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      StatusChip(status: job.status),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text('Job #${job.id} · ${job.status}',
                            style: t.textTheme.titleMedium),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Text('follow-up #${job.followUpId} '
                        '(ids only — no patient data in the job)'),
                    Text('attempts: ${job.attempts} / ${job.maxAttempts}'),
                    SelectableText('correlation: ${job.correlationId}',
                        style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
                    if (job.lastErrorCode != null) Text('last error: ${job.lastErrorCode}'),
                    if (job.lastErrorText != null)
                      Text(job.lastErrorText!, style: t.textTheme.bodySmall),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Attempt timeline', style: t.textTheme.titleMedium),
            const SizedBox(height: 6),
            if (attempts.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text('No attempts recorded yet.'),
              ),
            for (final raw in attempts) _AttemptTile(attempt: (raw as Map).cast<String, dynamic>()),
            if (alerts.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Alerts', style: t.textTheme.titleMedium),
              for (final raw in alerts)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    (raw as Map)['readAt'] == null
                        ? Icons.notifications_active
                        : Icons.notifications_none,
                    color: Palette.accent,
                  ),
                  title: Text('${raw['message']}'),
                  subtitle: Text('${raw['createdAt']}'
                      '${raw['readAt'] == null ? ' · unread' : ' · acknowledged'}'),
                ),
            ],
            const SizedBox(height: 18),
            if (!isDoctor)
              const Text('Only a doctor can retry or acknowledge this job.',
                  style: TextStyle(fontSize: 12)),
            if (isDoctor && needsHuman) ...[
              FilledButton.icon(
                onPressed: _retry,
                icon: const Icon(Icons.replay),
                label: const Text('Retry with a reason'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _acknowledge,
                icon: const Icon(Icons.done_all),
                label: const Text('Acknowledge alerts'),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _AttemptTile extends StatelessWidget {
  const _AttemptTile({required this.attempt});
  final Map<String, dynamic> attempt;

  @override
  Widget build(BuildContext context) {
    final outcome = '${attempt['outcome']}';
    final (Color color, IconData icon) = switch (outcome) {
      'succeeded' => (Colors.green, Icons.check),
      'transient_error' => (Colors.blueGrey, Icons.autorenew),
      'permanent_error' => (Colors.red, Icons.block),
      'validation_error' => (Colors.deepPurple, Icons.rule),
      'obsolete' => (Colors.blueGrey, Icons.archive_outlined),
      'human_retry' => (Colors.teal, Icons.person),
      _ => (Colors.grey, Icons.help_outline),
    };
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: color, size: 20),
      title: Text('Attempt ${attempt['attemptNo']} · $outcome'),
      subtitle: Text([
        '${attempt['startedAt']}',
        '${attempt['durationMs']} ms',
        if (attempt['httpStatus'] != null) 'HTTP ${attempt['httpStatus']}',
        if (attempt['errorCode'] != null) '${attempt['errorCode']}',
        if (attempt['actorNote'] != null) '${attempt['actorNote']}',
      ].join(' · ')),
    );
  }
}

class ReasonDialog extends StatefulWidget {
  const ReasonDialog({super.key});
  @override
  State<ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<ReasonDialog> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Retry reminder job'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('The reason is recorded in the audit trail.'),
          const SizedBox(height: 10),
          TextField(
            controller: _controller,
            autofocus: true,
            maxLength: 300,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: 'Reason (min 8 characters)',
              errorText: _error,
              border: const OutlineInputBorder(),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final s = _controller.text.trim();
            if (s.length < 8) {
              setState(() => _error = 'At least 8 characters.');
              return;
            }
            Navigator.of(context).pop(s);
          },
          child: const Text('Retry'),
        ),
      ],
    );
  }
}

class QueueReminderDialog extends StatefulWidget {
  const QueueReminderDialog({super.key});
  @override
  State<QueueReminderDialog> createState() => _QueueReminderDialogState();
}

class _QueueReminderDialogState extends State<QueueReminderDialog> {
  final _form = GlobalKey<FormState>();
  final _id = TextEditingController(text: '1');
  bool _busy = false;
  String? _serverError;

  @override
  void dispose() {
    _id.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    setState(() {
      _busy = true;
      _serverError = null;
    });
    try {
      final data = await ReminderApi.instance.enqueue(int.parse(_id.text.trim()));
      final dedup = data['deduplicated'] == true;
      messenger.showSnackBar(SnackBar(
        content: Text(dedup
            ? 'A job for this follow-up already exists — not duplicated.'
            : 'Reminder queued.'),
      ));
      navigator.pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _serverError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Queue a reminder'),
      content: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'The follow-up must be "scheduled" and due today or earlier. '
                  'The job stores ids only.',
              style: TextStyle(fontSize: 12),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _id,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Follow-up ID',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                final n = int.tryParse((v ?? '').trim());
                if (n == null || n < 1) return 'Positive whole number';
                return null;
              },
            ),
            if (_serverError != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(top: 12),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_serverError!, style: const TextStyle(fontSize: 12)),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
              height: 18, width: 18,
              child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Queue'),
        ),
      ],
    );
  }
}