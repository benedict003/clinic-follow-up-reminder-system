// lib/screens/follow_up_detail_screen.dart
//
// One follow-up, as a clinician reads it: who the patient is, when it is due,
// why it exists, what has already been done about it, and the three actions a
// clinic takes from here — log the contact, move the date, close it.
//
// Layout note: everything here is a SingleChildScrollView of plain widgets.
// The exchange screen's freeze came from a ListView whose sliver was hit-tested
// before it had geometry, so this page does not use slivers at all.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/clinic_api.dart';
import '../api/clinical_api.dart';
import '../api/reminder_api.dart';
import '../models/clinical.dart';
import '../widgets/clinical.dart';
import '../widgets/ui.dart';

class FollowUpDetailScreen extends StatefulWidget {
  const FollowUpDetailScreen({super.key, required this.followUpId});

  final int followUpId;

  @override
  State<FollowUpDetailScreen> createState() => _FollowUpDetailScreenState();
}

class _FollowUpDetailScreenState extends State<FollowUpDetailScreen> {
  Future<FollowUpDetail>? _future;
  bool _busy = false;
  // Kept for the sheet-level error path; the detail screen reports through
  // snackbars, so nothing reads it yet.
  // ignore: unused_field
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  void _load() {
    final Future<FollowUpDetail> future =
    guardFuture(ClinicalApi.instance.detail(widget.followUpId));
    setState(() {
      _future = future;
    });
  }

  Future<void> _refresh() async {
    _load();
    await _future;
  }

  bool get _isDoctor => ClinicApi.instance.isDoctor;

  void _tell(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // ── actions ───────────────────────────────────────────────────────────────

  Future<void> _logContact() async {
    final String? outcome = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext ctx) => const _ContactSheet(),
    );
    if (outcome == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ClinicalApi.instance.logContact(widget.followUpId, outcome: outcome);
      _load();
      _tell('Contact attempt recorded.');
    } on ApiException catch (e) {
      _tell(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reschedule() async {
    final ({String dueDate, String? note})? picked =
    await showModalBottomSheet<({String dueDate, String? note})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: const _RescheduleSheet(),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final ({ClinicalFollowUp followUp, int supersededJobs}) result =
      await ClinicalApi.instance
          .reschedule(widget.followUpId, dueDate: picked.dueDate, note: picked.note);
      _load();
      _tell(result.supersededJobs > 0
          ? 'Moved to ${formatShortDate(result.followUp.dueDate)}. '
          '${result.supersededJobs} queued reminder(s) superseded.'
          : 'Moved to ${formatShortDate(result.followUp.dueDate)}.');
    } on ApiException catch (e) {
      _tell(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _close() async {
    final ({String outcome, String? note})? picked =
    await showModalBottomSheet<({String outcome, String? note})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: const _CloseSheet(),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ClinicalApi.instance
          .close(widget.followUpId, outcome: picked.outcome, note: picked.note);
      _load();
      _tell('Follow-up closed.');
    } on ApiException catch (e) {
      _tell(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _queueReminder() async {
    setState(() => _busy = true);
    try {
      final Map<String, dynamic> res = await ReminderApi.instance.enqueue(widget.followUpId);
      final bool deduplicated = res['deduplicated'] == true;
      _load();
      _tell(deduplicated
          ? 'A reminder for this version is already queued.'
          : 'Reminder queued. The worker will attempt delivery.');
    } on ApiException catch (e) {
      _tell(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _copy(String label, String value) {
    if (value.isEmpty) return;
    Clipboard.setData(ClipboardData(text: value));
    _tell('$label copied');
  }

  // ── build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Follow-up #${widget.followUpId}'),
        actions: <Widget>[
          IconButton(tooltip: 'Reload', onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: FutureBuilder<FollowUpDetail>(
        future: _future,
        builder: (BuildContext context, AsyncSnapshot<FollowUpDetail> snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(error: snap.error!, onRetry: _load);
          }
          final FollowUpDetail d = snap.data!;
          return RefreshIndicator(
            onRefresh: _refresh,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  _patientCard(d),
                  const SizedBox(height: 10),
                  _dueCard(d),
                  const SizedBox(height: 10),
                  _actionCard(d),
                  const SizedBox(height: 10),
                  _timelineCard(d),
                  const SizedBox(height: 10),
                  if (d.jobs.isNotEmpty) _automationCard(d),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _patientCard(FollowUpDetail d) {
    final ThemeData t = Theme.of(context);
    final ClinicalPatient p = d.patient;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                CircleAvatar(
                  radius: 20,
                  backgroundColor: t.colorScheme.primaryContainer,
                  child: Text(p.initials,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: t.colorScheme.onPrimaryContainer)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(p.name, style: t.textTheme.titleMedium),
                      Text('${p.id} · ${p.category}',
                          style: t.textTheme.bodySmall
                              ?.copyWith(color: t.colorScheme.outline)),
                    ],
                  ),
                ),
                if (p.openFollowUps > 0)
                  Chip(
                    visualDensity: VisualDensity.compact,
                    label: Text('${p.openFollowUps} open'),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                Icon(Icons.call_outlined, size: 16, color: t.colorScheme.outline),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    p.contactNumber ?? 'No contact number on file',
                    style: TextStyle(
                      fontSize: 13,
                      fontFamily: p.contactNumber == null ? null : 'monospace',
                      color: p.contactNumber == null ? t.colorScheme.error : null,
                    ),
                  ),
                ),
                if (p.contactNumber != null)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Copy number',
                    icon: const Icon(Icons.copy, size: 16),
                    onPressed: () => _copy('Number', p.contactNumber!),
                  ),
              ],
            ),
            if (p.contactNumber == null)
              Text(
                'A follow-up cannot be made without a way to reach the patient. '
                    'Update the register at the desk.',
                style: TextStyle(fontSize: 11, color: t.colorScheme.error),
              ),
          ],
        ),
      ),
    );
  }

  Widget _dueCard(FollowUpDetail d) {
    final ClinicalFollowUp f = d.followUp;
    final ThemeData t = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(f.due.urgent ? Icons.warning_amber_rounded : Icons.event,
                    size: 18, color: f.due.color),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(formatDueDate(f.dueDate),
                      style: t.textTheme.titleSmall),
                ),
                DueBadge(followUp: f),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: <Widget>[
                StatusPill(status: f.status),
                const SizedBox(width: 10),
                Text('revision ${f.version}',
                    style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline)),
                if (f.contactAttempts > 0) ...<Widget>[
                  const SizedBox(width: 10),
                  Icon(Icons.phone_in_talk_outlined, size: 13, color: t.colorScheme.outline),
                  const SizedBox(width: 3),
                  Text('${f.contactAttempts} attempt(s)', style: t.textTheme.bodySmall),
                ],
              ],
            ),
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: t.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(f.reason, style: t.textTheme.bodyMedium),
            ),
            if (f.status == FollowUpStatus.closed) ...<Widget>[
              const SizedBox(height: 8),
              Text(
                'Closed ${f.closedAt ?? ''}'
                    '${f.closeOutcome == null ? '' : ' — ${f.closeOutcome!.replaceAll('_', ' ')}'}',
                style: t.textTheme.bodySmall,
              ),
              if (f.closeNote != null)
                Text(f.closeNote!, style: t.textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }

  Widget _actionCard(FollowUpDetail d) {
    final ClinicalFollowUp f = d.followUp;
    final bool open = f.isOpen;
    final ThemeData t = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('What happens next', style: t.textTheme.titleSmall),
            const SizedBox(height: 10),
            if (!open)
              Row(
                children: <Widget>[
                  const Icon(Icons.task_alt, size: 16, color: Color(0xFF2E9E7E)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'This record is closed. Nothing further is owed to the patient.',
                      style: t.textTheme.bodySmall,
                    ),
                  ),
                ],
              )
            else ...<Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : _logContact,
                      icon: const Icon(Icons.phone_callback_outlined, size: 18),
                      label: const Text('Log contact'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                      onPressed: _busy ? null : _reschedule,
                      icon: const Icon(Icons.event_repeat, size: 18),
                      label: const Text('Reschedule'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              // Queueing a reminder is a Module 13 action, so its availability
              // comes from the server rather than being guessed here.
              if (f.canQueueReminder)
                FilledButton.tonalIcon(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 46)),
                  onPressed: _busy ? null : _queueReminder,
                  icon: const Icon(Icons.notifications_active_outlined, size: 18),
                  label: const Text('Queue the automated reminder'),
                ),
              if (f.canQueueReminder) const SizedBox(height: 8),
              if (_isDoctor)
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 46),
                    foregroundColor: t.colorScheme.error,
                    side: BorderSide(color: t.colorScheme.error.withValues(alpha: 0.5)),
                  ),
                  onPressed: _busy ? null : _close,
                  icon: const Icon(Icons.task_alt, size: 18),
                  label: const Text('Close this follow-up'),
                )
              else
                Text(
                  'Only a doctor can close a follow-up, because the outcome is a '
                  'clinical decision. A nurse can record contact and move the date.',
                  style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
                ),
            ],
            if (_busy) ...<Widget>[
              const SizedBox(height: 10),
              const LinearProgressIndicator(minHeight: 2),
            ],
          ],
        ),
      ),
    );
  }

  Widget _timelineCard(FollowUpDetail d) {
    final ThemeData t = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Text('Record history', style: t.textTheme.titleSmall),
                const Spacer(),
                Text('${d.events.length}', style: t.textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Append-only: every action, who did it and when.',
              style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
            ),
            const SizedBox(height: 10),
            if (d.events.isEmpty)
              Text('Nothing recorded yet.', style: t.textTheme.bodySmall)
            else
              for (int i = 0; i < d.events.length; i++)
                _eventRow(d.events[i], last: i == d.events.length - 1),
          ],
        ),
      ),
    );
  }

  Widget _eventRow(FollowUpEvent e, {required bool last}) {
    final ThemeData t = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Column(
          children: <Widget>[
            CircleAvatar(
              radius: 12,
              backgroundColor: t.colorScheme.surfaceContainerHighest,
              child: Icon(e.icon, size: 13, color: t.colorScheme.primary),
            ),
            if (!last)
              Container(
                width: 1.5,
                height: 30,
                color: t.dividerColor,
              ),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: last ? 0 : 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(e.title,
                    style: t.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                if (e.detail != null)
                  Text(e.detail!, style: t.textTheme.bodySmall),
                Text(
                  '${formatStamp(e.createdAt)}'
                      '${e.actorName == null ? '' : ' · ${e.actorName} (${e.actorRole})'}',
                  style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _automationCard(FollowUpDetail d) {
    final ThemeData t = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Automated reminders', style: t.textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(
              'Queued by this system, delivered over loopback. A closed or '
                  'rescheduled record makes its older reminders obsolete.',
              style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
            ),
            const SizedBox(height: 8),
            for (final ReminderJobSummary j in d.jobs)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: <Widget>[
                    Icon(
                      switch (j.status) {
                        'succeeded' => Icons.check_circle_outline,
                        'needs_human' => Icons.report_problem_outlined,
                        'obsolete' => Icons.archive_outlined,
                        'running' => Icons.hourglass_bottom,
                        _ => Icons.schedule,
                      },
                      size: 15,
                      color: t.colorScheme.outline,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Job #${j.id} · ${j.status.replaceAll('_', ' ')} · '
                            '${j.attempts}/${j.maxAttempts} attempts'
                            '${j.lastErrorCode == null ? '' : ' · ${j.lastErrorCode}'}',
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 11.5),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── sheets ──────────────────────────────────────────────────────────────────

/// Contact attempts, in the words used on the phone.
class _ContactSheet extends StatelessWidget {
  const _ContactSheet();

  @override
  Widget build(BuildContext context) {
    final ThemeData t = Theme.of(context);
    const List<({String value, String label, String hint})> options =
    <({String value, String label, String hint})>[
      (value: 'reached', label: 'Patient reached', hint: 'They were told about the follow-up'),
      (value: 'no_answer', label: 'Called, no answer', hint: 'The phone rang but nobody picked up'),
      (value: 'voicemail', label: 'Voicemail left', hint: 'A message was left'),
      (value: 'wrong_number', label: 'Wrong number', hint: 'The number on file is not theirs'),
    ];

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('What happened on the call?', style: t.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('Only "reached" moves the record to Reminded.',
                style: t.textTheme.bodySmall),
            const SizedBox(height: 12),
            for (final ({String value, String label, String hint}) o in options)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: Icon(
                    switch (o.value) {
                      'reached' => Icons.check_circle_outline,
                      'no_answer' => Icons.phone_missed,
                      'voicemail' => Icons.voicemail_outlined,
                      _ => Icons.phonelink_erase,
                    },
                    color: o.value == 'reached' ? const Color(0xFF2E9E7E) : null,
                  ),
                  title: Text(o.label),
                  subtitle: Text(o.hint),
                  onTap: () => Navigator.of(context).pop(o.value),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RescheduleSheet extends StatefulWidget {
  const _RescheduleSheet();

  @override
  State<_RescheduleSheet> createState() => _RescheduleSheetState();
}

class _RescheduleSheetState extends State<_RescheduleSheet> {
  final TextEditingController _note = TextEditingController();
  late DateTime _due = DateTime.now().add(const Duration(days: 7));

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  String get _iso => '${_due.year.toString().padLeft(4, '0')}-'
      '${_due.month.toString().padLeft(2, '0')}-'
      '${_due.day.toString().padLeft(2, '0')}';

  Future<void> _pick() async {
    final DateTime today = DateTime.now();
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _due,
      firstDate: today,
      lastDate: DateTime(today.year + 3),
      helpText: 'New due date',
    );
    if (picked != null && mounted) setState(() => _due = picked);
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData t = Theme.of(context);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Move the due date', style: t.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'The record gets a new revision, so a reminder already queued for '
                  'the old date becomes obsolete instead of chasing the patient twice.',
              style: t.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Card(
              margin: EdgeInsets.zero,
              child: ListTile(
                leading: const Icon(Icons.event),
                title: Text(formatDueDate(_iso)),
                trailing: const Icon(Icons.edit_calendar, size: 18),
                onTap: _pick,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              minLines: 2,
              maxLines: 3,
              maxLength: 300,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                isDense: true,
                labelText: 'Why was it moved?',
                hintText: 'e.g. Patient asked for a later date',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 4),
            FilledButton.icon(
              onPressed: () => Navigator.of(context)
                  .pop((dueDate: _iso, note: _note.text.trim().isEmpty ? null : _note.text.trim())),
              icon: const Icon(Icons.event_repeat),
              label: const Text('Save new date'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CloseSheet extends StatefulWidget {
  const _CloseSheet();

  @override
  State<_CloseSheet> createState() => _CloseSheetState();
}

class _CloseSheetState extends State<_CloseSheet> {
  final TextEditingController _note = TextEditingController();
  String _outcome = 'attended';

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData t = Theme.of(context);
    const List<({String value, String label})> outcomes =
    <({String value, String label})>[
      (value: 'attended', label: 'Patient attended'),
      (value: 'declined', label: 'Patient declined'),
      (value: 'referred', label: 'Referred elsewhere'),
      (value: 'moved_away', label: 'Moved away / transferred care'),
      (value: 'lost_to_follow_up', label: 'Lost to follow-up'),
      (value: 'not_indicated', label: 'No longer clinically indicated'),
    ];
    final bool noteRequired = _outcome == 'lost_to_follow_up';

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Close this follow-up', style: t.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'This is the clinical outcome. It is kept on the record and cannot '
                  'be edited afterwards, so state what actually happened.',
              style: t.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            for (final ({String value, String label}) o in outcomes)
              // A plain ListTile rather than RadioListTile: Radio's group API is
              // mid-migration in current Flutter, and a check icon says the same
              // thing without a deprecated parameter.
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: Icon(
                  _outcome == o.value
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                  color: _outcome == o.value ? t.colorScheme.primary : t.colorScheme.outline,
                ),
                title: Text(o.label),
                onTap: () => setState(() => _outcome = o.value),
              ),
            const SizedBox(height: 8),
            TextField(
              controller: _note,
              minLines: 2,
              maxLines: 3,
              maxLength: 300,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                isDense: true,
                labelText: noteRequired ? 'What was tried? (required)' : 'Note (optional)',
                border: const OutlineInputBorder(),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 4),
            FilledButton.icon(
              onPressed: noteRequired && _note.text.trim().isEmpty
                  ? null
                  : () => Navigator.of(context).pop((
              outcome: _outcome,
              note: _note.text.trim().isEmpty ? null : _note.text.trim(),
              )),
              icon: const Icon(Icons.task_alt),
              label: const Text('Close follow-up'),
            ),
          ],
        ),
      ),
    );
  }
}
