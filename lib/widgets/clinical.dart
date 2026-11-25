// lib/widgets/clinical.dart
//
// Shared clinical UI pieces: how a follow-up looks in a list, how its state is
// shown, and the small formatting a clinic actually reads (24 Nov, 4 days
// overdue) rather than raw ISO strings.
import 'package:flutter/material.dart';

import '../models/clinical.dart';

const List<String> _months = <String>[
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const List<String> _weekdays = <String>[
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
];

/// '2026-11-24' → 'Tue 24 Nov 2026'. Unparseable input is returned unchanged
/// rather than thrown: a malformed date must not take a screen down.
String formatDueDate(String? ymd) {
  if (ymd == null || ymd.length < 10) return ymd ?? '';
  final DateTime? d = DateTime.tryParse(ymd.substring(0, 10));
  if (d == null) return ymd;
  return '${_weekdays[d.weekday - 1]} ${d.day} ${_months[d.month - 1]} ${d.year}';
}

String formatShortDate(String? ymd) {
  if (ymd == null || ymd.length < 10) return ymd ?? '';
  final DateTime? d = DateTime.tryParse(ymd.substring(0, 10));
  if (d == null) return ymd;
  return '${d.day} ${_months[d.month - 1]}';
}

/// '2026-11-24T12:48:16.000Z' or '2026-11-24 12:48:16' → '24 Nov, 12:48'.
String formatStamp(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  final DateTime? d = DateTime.tryParse(raw.replaceFirst(' ', 'T'));
  if (d == null) return raw;
  final DateTime local = d.isUtc ? d.toLocal() : d;
  final String hh = local.hour.toString().padLeft(2, '0');
  final String mm = local.minute.toString().padLeft(2, '0');
  return '${local.day} ${_months[local.month - 1]}, $hh:$mm';
}

/// The pill that says what the record is waiting for.
class DueBadge extends StatelessWidget {
  const DueBadge({super.key, required this.followUp, this.compact = false});

  final ClinicalFollowUp followUp;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final DueState due = followUp.due;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 7 : 9, vertical: compact ? 3 : 4),
      decoration: BoxDecoration(
        color: due.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: due.color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (due.urgent) ...<Widget>[
            Icon(Icons.priority_high, size: compact ? 11 : 13, color: due.color),
            const SizedBox(width: 2),
          ],
          Text(
            due.label,
            style: TextStyle(
              color: due.color,
              fontSize: compact ? 10.5 : 11.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.status});

  final FollowUpStatus status;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(status.icon, size: 14, color: status.color),
        const SizedBox(width: 4),
        Text(
          status.label,
          style: TextStyle(fontSize: 11.5, color: status.color, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

/// One follow-up on the board. Used by the worklist and the Follow-ups tab so
/// the two can never drift apart visually.
class FollowUpCard extends StatelessWidget {
  const FollowUpCard({super.key, required this.followUp, this.onTap, this.trailing});

  final ClinicalFollowUp followUp;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final ThemeData t = Theme.of(context);
    final Color accent = followUp.due.color;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // A colour bar reads faster than a status word at a glance.
              Container(width: 4, color: accent),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: Text(
                              followUp.patientName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: t.textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w600),
                            ),
                          ),
                          const SizedBox(width: 8),
                          DueBadge(followUp: followUp, compact: true),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${followUp.patientId} · ${followUp.patientCategory}',
                        style: t.textTheme.bodySmall
                            ?.copyWith(color: t.colorScheme.outline),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        followUp.reason,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: t.textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: <Widget>[
                          StatusPill(status: followUp.status),
                          const SizedBox(width: 10),
                          Icon(Icons.event, size: 13, color: t.colorScheme.outline),
                          const SizedBox(width: 3),
                          Text(
                            formatShortDate(followUp.dueDate),
                            style: t.textTheme.bodySmall,
                          ),
                          if (followUp.contactAttempts > 0) ...<Widget>[
                            const SizedBox(width: 10),
                            Icon(Icons.phone_in_talk_outlined,
                                size: 13, color: t.colorScheme.outline),
                            const SizedBox(width: 3),
                            Text(
                              '${followUp.contactAttempts}',
                              style: t.textTheme.bodySmall,
                            ),
                          ],
                          const Spacer(),
                          if (trailing case final Widget w) w,
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A non-scrolling empty state, safe to place inside any scroll view.
class EmptyNote extends StatelessWidget {
  const EmptyNote({
    super.key,
    required this.title,
    this.detail,
    this.icon = Icons.inbox_outlined,
    this.action,
  });

  final String title;
  final String? detail;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final ThemeData t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 24),
      child: Column(
        children: <Widget>[
          Icon(icon, size: 42, color: t.colorScheme.outline),
          const SizedBox(height: 10),
          Text(title, textAlign: TextAlign.center, style: t.textTheme.titleSmall),
          if (detail != null) ...<Widget>[
            const SizedBox(height: 4),
            Text(
              detail!,
              textAlign: TextAlign.center,
              style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
            ),
          ],
          if (action != null) ...<Widget>[const SizedBox(height: 14), action!],
        ],
      ),
    );
  }
}

/// Marks a future's failure as handled from the moment it is created.
///
/// A screen that hands a future to a FutureBuilder only starts listening on the
/// next frame. If the request fails in between — routine when the backend is
/// down, or in a widget test where every request returns 400 — the failure is
/// reported as an unhandled async error even though the UI shows it properly.
/// Attaching a no-op listener keeps the zone quiet without consuming the result:
/// the FutureBuilder still receives the error and still renders ErrorView.
Future<T> guardFuture<T>(Future<T> future) {
  future.then((T _) {}, onError: (Object _) {});
  return future;
}

/// A button that is safe inside a Row.
///
/// AppTheme sets `minimumSize: Size.fromHeight(48)` — minWidth = infinity —
/// which is correct in a Column and throws "BoxConstraints forces an infinite
/// width" inside a Row. Every button in a horizontal layout goes through here.
ButtonStyle boundedButtonStyle(BuildContext context, {double minWidth = 0}) =>
    FilledButton.styleFrom(
      minimumSize: Size(minWidth, 44),
      padding: const EdgeInsets.symmetric(horizontal: 16),
    );
