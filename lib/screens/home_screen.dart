// lib/screens/home_screen.dart
//
// The first screen of a working day: who is late, who is due today, and whether
// the automation needs a human. Everything is tappable through to the record,
// because a number a clinician cannot act on is decoration.
import 'package:flutter/material.dart';

import '../api/clinical_api.dart';
import '../models/clinical.dart';
import '../widgets/clinical.dart';
import '../widgets/ui.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.onOpenTab,
    required this.onOpenFollowUps,
    required this.onOpenFollowUp,
  });

  /// Switches the bottom tab, e.g. to Reminders.
  final ValueChanged<int> onOpenTab;

  /// Opens the Follow-ups tab already filtered, e.g. to 'overdue'.
  final ValueChanged<String> onOpenFollowUps;

  /// Opens one record.
  final ValueChanged<int> onOpenFollowUp;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Future<Worklist>? _future;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  void _load() {
    final Future<Worklist> future = guardFuture(ClinicalApi.instance.worklist());
    setState(() {
      _future = future;
    });
  }

  Future<void> _refresh() async {
    _load();
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<Worklist>(
        future: _future,
        builder: (BuildContext context, AsyncSnapshot<Worklist> snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const LoadingView();
          }
          if (snap.hasError) {
            return ErrorView(error: snap.error!, onRetry: _load);
          }
          final Worklist w = snap.data!;
          final ThemeData t = Theme.of(context);

          return SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                _header(w),
                const SizedBox(height: 14),
                LayoutBuilder(builder: (BuildContext ctx, BoxConstraints c) {
                  final bool twoUp = c.maxWidth >= 520;
                  final List<Widget> tiles = <Widget>[
                    _statTile(
                      label: 'Overdue',
                      value: w.counts.overdue,
                      icon: Icons.warning_amber_rounded,
                      colour: const Color(0xFFB3261E),
                      onTap: () => widget.onOpenFollowUps('overdue'),
                    ),
                    _statTile(
                      label: 'Due today',
                      value: w.counts.dueToday,
                      icon: Icons.today,
                      colour: const Color(0xFFB26A00),
                      onTap: () => widget.onOpenFollowUps('today'),
                    ),
                    _statTile(
                      label: 'Upcoming',
                      value: w.counts.upcoming,
                      icon: Icons.upcoming_outlined,
                      colour: const Color(0xFF4A6FA5),
                      onTap: () => widget.onOpenFollowUps('upcoming'),
                    ),
                    _statTile(
                      label: 'Needs a human',
                      value: w.counts.needsHuman,
                      icon: Icons.report_problem_outlined,
                      colour: w.counts.needsHuman > 0
                          ? const Color(0xFFB3261E)
                          : const Color(0xFF6B7280),
                      onTap: () => widget.onOpenTab(2),
                    ),
                  ];
                  if (!twoUp) {
                    return Column(
                      children: <Widget>[
                        for (final Widget tile in tiles)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: tile,
                          ),
                      ],
                    );
                  }
                  return Column(
                    children: <Widget>[
                      Row(children: <Widget>[
                        Expanded(child: tiles[0]),
                        const SizedBox(width: 8),
                        Expanded(child: tiles[1]),
                      ]),
                      const SizedBox(height: 8),
                      Row(children: <Widget>[
                        Expanded(child: tiles[2]),
                        const SizedBox(width: 8),
                        Expanded(child: tiles[3]),
                      ]),
                    ],
                  );
                }),
                const SizedBox(height: 16),
                if (w.overdue.isNotEmpty) ...<Widget>[
                  _sectionHeader(
                    'Late',
                    '${w.counts.overdue}',
                    onSeeAll: () => widget.onOpenFollowUps('overdue'),
                  ),
                  for (final ClinicalFollowUp f in w.overdue)
                    FollowUpCard(
                      followUp: f,
                      onTap: () => widget.onOpenFollowUp(f.id),
                    ),
                  const SizedBox(height: 8),
                ],
                if (w.dueToday.isNotEmpty) ...<Widget>[
                  _sectionHeader(
                    'Due today',
                    '${w.counts.dueToday}',
                    onSeeAll: () => widget.onOpenFollowUps('today'),
                  ),
                  for (final ClinicalFollowUp f in w.dueToday)
                    FollowUpCard(
                      followUp: f,
                      onTap: () => widget.onOpenFollowUp(f.id),
                    ),
                  const SizedBox(height: 8),
                ],
                if (w.overdue.isEmpty && w.dueToday.isEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: <Widget>[
                          const Icon(Icons.check_circle_outline,
                              color: Color(0xFF2E9E7E)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text('Nothing is due today',
                                    style: t.textTheme.titleSmall),
                                Text(
                                  '${w.counts.upcoming} follow-up(s) are coming up. '
                                      'The register stays a click away.',
                                  style: t.textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
                _activityCard(w),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _header(Worklist w) {
    final ThemeData t = Theme.of(context);
    return Card(
      color: t.colorScheme.primary,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              formatDueDate(w.today),
              style: const TextStyle(color: Colors.white70, fontSize: 11.5),
            ),
            const SizedBox(height: 4),
            Row(
              children: <Widget>[
                const Icon(Icons.event_repeat, color: Colors.white, size: 26),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Clinic follow-up worklist',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              w.counts.overdue > 0
                  ? '${w.counts.overdue} patient(s) are past their due date. '
                  'Start there; a late follow-up is the one that matters.'
                  : 'No patient is past their due date. '
                  '${w.counts.dueToday} due today.',
              style: const TextStyle(color: Colors.white70, fontSize: 12.5, height: 1.35),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statTile({
    required String label,
    required int value,
    required IconData icon,
    required Color colour,
    required VoidCallback onTap,
  }) {
    final ThemeData t = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: <Widget>[
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: colour.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: colour, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('$value',
                        style: t.textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    Text(label, style: t.textTheme.labelSmall),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, size: 18, color: t.colorScheme.outline),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionHeader(String title, String count, {required VoidCallback onSeeAll}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
      child: Row(
        children: <Widget>[
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(width: 8),
          Text(count, style: Theme.of(context).textTheme.bodySmall),
          const Spacer(),
          TextButton(onPressed: onSeeAll, child: const Text('See all')),
        ],
      ),
    );
  }

  Widget _activityCard(Worklist w) {
    final ThemeData t = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Today at a glance', style: t.textTheme.titleSmall),
            const SizedBox(height: 8),
            Row(
              children: <Widget>[
                Icon(Icons.phone_in_talk_outlined, size: 15, color: t.colorScheme.outline),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${w.counts.contactsToday} contact attempt(s) recorded today',
                    style: t.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: <Widget>[
                Icon(Icons.inbox_outlined, size: 15, color: t.colorScheme.outline),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${w.counts.open} open record(s), ${w.counts.closed} closed',
                    style: t.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: <Widget>[
                Icon(Icons.notifications_outlined, size: 15, color: t.colorScheme.outline),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    w.counts.unreadAlerts > 0
                        ? '${w.counts.unreadAlerts} unread automation alert(s) for a doctor'
                        : 'No unread automation alerts',
                    style: t.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
