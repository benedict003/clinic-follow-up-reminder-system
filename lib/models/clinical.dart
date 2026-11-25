// lib/models/clinical.dart
//
// The clinical records the app works with. Typed rather than Map<String,dynamic>:
// a follow-up has a status, a due date and a history, and getting one of those
// wrong in a clinical tool is not a cosmetic bug.
import 'package:flutter/material.dart';

/// sched = still owed to the patient, reminded = the patient has been told,
/// closed = resolved with an outcome.
enum FollowUpStatus { scheduled, reminded, closed }

FollowUpStatus statusFromJson(Object? raw) => switch ('$raw') {
  'reminded' => FollowUpStatus.reminded,
  'closed' => FollowUpStatus.closed,
  _ => FollowUpStatus.scheduled,
};

extension FollowUpStatusUi on FollowUpStatus {
  String get label => switch (this) {
    FollowUpStatus.scheduled => 'Scheduled',
    FollowUpStatus.reminded => 'Reminded',
    FollowUpStatus.closed => 'Closed',
  };

  Color get color => switch (this) {
    FollowUpStatus.scheduled => const Color(0xFF4A6FA5),
    FollowUpStatus.reminded => const Color(0xFF2E9E7E),
    FollowUpStatus.closed => const Color(0xFF6B7280),
  };

  IconData get icon => switch (this) {
    FollowUpStatus.scheduled => Icons.schedule,
    FollowUpStatus.reminded => Icons.notifications_active_outlined,
    FollowUpStatus.closed => Icons.task_alt,
  };
}

/// What the record is waiting for, in the words a clinic uses at the desk.
class DueState {
  const DueState(this.label, this.color, this.urgent);

  final String label;
  final Color color;
  final bool urgent;

  static DueState of(ClinicalFollowUp f) {
    if (f.status == FollowUpStatus.closed) {
      return const DueState('Closed', Color(0xFF6B7280), false);
    }
    final int d = f.daysFromToday;
    if (d < 0) {
      final int n = -d;
      return DueState('$n ${n == 1 ? 'day' : 'days'} overdue',
          const Color(0xFFB3261E), true);
    }
    if (d == 0) return const DueState('Due today', Color(0xFFB26A00), true);
    if (d == 1) return const DueState('Due tomorrow', Color(0xFF4A6FA5), false);
    if (d <= 7) return DueState('In $d days', const Color(0xFF4A6FA5), false);
    return DueState('In $d days', const Color(0xFF6B7280), false);
  }
}

class ClinicalPatient {
  const ClinicalPatient({
    required this.id,
    required this.name,
    required this.category,
    this.contactNumber,
    this.birthDate,
    this.openFollowUps = 0,
  });

  final String id;
  final String name;
  final String category;
  final String? contactNumber;
  final String? birthDate;
  final int openFollowUps;

  factory ClinicalPatient.fromJson(Map<String, dynamic> j) => ClinicalPatient(
    id: '${j['id']}',
    name: '${j['name']}',
    category: '${j['category'] ?? 'student'}',
    contactNumber: j['contactNumber']?.toString(),
    birthDate: j['birthDate']?.toString(),
    openFollowUps: (j['openFollowUps'] as num?)?.toInt() ?? 0,
  );

  String get initials {
    final List<String> parts =
    name.trim().split(RegExp(r'\s+')).where((String p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }
}

class ClinicalFollowUp {
  const ClinicalFollowUp({
    required this.id,
    required this.patientId,
    required this.patientName,
    required this.dueDate,
    required this.reason,
    required this.status,
    required this.version,
    required this.daysFromToday,
    this.patientCategory = 'student',
    this.contactNumber,
    this.contactAttempts = 0,
    this.lastContactAt,
    this.closedAt,
    this.closeOutcome,
    this.closeNote,
    this.overdue = false,
    this.canQueueReminder = false,
  });

  final int id;
  final String patientId;
  final String patientName;
  final String patientCategory;
  final String? contactNumber;
  final String dueDate;
  final String reason;
  final FollowUpStatus status;
  final int version;
  final int daysFromToday;
  final int contactAttempts;
  final String? lastContactAt;
  final String? closedAt;
  final String? closeOutcome;
  final String? closeNote;
  final bool overdue;
  final bool canQueueReminder;

  factory ClinicalFollowUp.fromJson(Map<String, dynamic> j) {
    final Map<String, dynamic> actions =
        (j['actions'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    return ClinicalFollowUp(
      id: (j['id'] as num).toInt(),
      patientId: '${j['patientId']}',
      patientName: '${j['patientName']}',
      patientCategory: '${j['patientCategory'] ?? 'student'}',
      contactNumber: j['contactNumber']?.toString(),
      dueDate: '${j['dueDate']}',
      reason: '${j['reason']}',
      status: statusFromJson(j['status']),
      version: (j['version'] as num?)?.toInt() ?? 1,
      daysFromToday: (j['daysFromToday'] as num?)?.toInt() ?? 0,
      contactAttempts: (j['contactAttempts'] as num?)?.toInt() ?? 0,
      lastContactAt: j['lastContactAt']?.toString(),
      closedAt: j['closedAt']?.toString(),
      closeOutcome: j['closeOutcome']?.toString(),
      closeNote: j['closeNote']?.toString(),
      overdue: j['overdue'] == true,
      canQueueReminder: actions['canQueueReminder'] == true,
    );
  }

  bool get isOpen => status != FollowUpStatus.closed;
  DueState get due => DueState.of(this);
}

class FollowUpEvent {
  const FollowUpEvent({
    required this.kind,
    this.outcome,
    this.note,
    this.fromDue,
    this.toDue,
    this.actorName,
    this.actorRole,
    this.createdAt,
  });

  final String kind;
  final String? outcome;
  final String? note;
  final String? fromDue;
  final String? toDue;
  final String? actorName;
  final String? actorRole;
  final String? createdAt;

  factory FollowUpEvent.fromJson(Map<String, dynamic> j) => FollowUpEvent(
    kind: '${j['kind']}',
    outcome: j['outcome']?.toString(),
    note: j['note']?.toString(),
    fromDue: j['fromDue']?.toString(),
    toDue: j['toDue']?.toString(),
    actorName: j['actorName']?.toString(),
    actorRole: j['actorRole']?.toString(),
    createdAt: j['createdAt']?.toString(),
  );

  IconData get icon => switch (kind) {
    'scheduled' => Icons.add_task,
    'contacted' => Icons.phone_callback_outlined,
    'rescheduled' => Icons.event_repeat,
    'closed' => Icons.task_alt,
    _ => Icons.notes,
  };

  String get title => switch (kind) {
    'scheduled' => 'Follow-up scheduled',
    'contacted' => switch (outcome) {
      'reached' => 'Patient reached',
      'no_answer' => 'Called, no answer',
      'voicemail' => 'Voicemail left',
      'wrong_number' => 'Wrong number',
      _ => 'Contact logged',
    },
    'rescheduled' => 'Rescheduled',
    'closed' => 'Closed — ${(outcome ?? '').replaceAll('_', ' ')}',
    _ => 'Note',
  };

  /// The date a reschedule moved from and to, when that is what happened.
  String? get detail {
    if (kind == 'rescheduled' && fromDue != null && toDue != null) {
      return '$fromDue → $toDue';
    }
    return note;
  }
}

class ReminderJobSummary {
  const ReminderJobSummary({
    required this.id,
    required this.status,
    required this.attempts,
    required this.maxAttempts,
    this.lastErrorCode,
    this.updatedAt,
  });

  final int id;
  final String status;
  final int attempts;
  final int maxAttempts;
  final String? lastErrorCode;
  final String? updatedAt;

  factory ReminderJobSummary.fromJson(Map<String, dynamic> j) => ReminderJobSummary(
    id: (j['id'] as num).toInt(),
    status: '${j['status']}',
    attempts: (j['attempts'] as num?)?.toInt() ?? 0,
    maxAttempts: (j['maxAttempts'] as num?)?.toInt() ?? 0,
    lastErrorCode: j['lastErrorCode']?.toString(),
    updatedAt: j['updatedAt']?.toString(),
  );
}

class FollowUpDetail {
  const FollowUpDetail({
    required this.followUp,
    required this.patient,
    required this.events,
    required this.jobs,
  });

  final ClinicalFollowUp followUp;
  final ClinicalPatient patient;
  final List<FollowUpEvent> events;
  final List<ReminderJobSummary> jobs;

  factory FollowUpDetail.fromJson(Map<String, dynamic> j) => FollowUpDetail(
    followUp: ClinicalFollowUp.fromJson((j['followUp'] as Map).cast<String, dynamic>()),
    patient: ClinicalPatient.fromJson((j['patient'] as Map).cast<String, dynamic>()),
    events: (j['events'] as List? ?? const <dynamic>[])
        .map((dynamic e) => FollowUpEvent.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false),
    jobs: (j['jobs'] as List? ?? const <dynamic>[])
        .map((dynamic e) => ReminderJobSummary.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false),
  );
}

/// Counts for the filter chips, and for the home screen.
class BoardCounts {
  const BoardCounts({
    this.overdue = 0,
    this.dueToday = 0,
    this.upcoming = 0,
    this.open = 0,
    this.closed = 0,
    this.needsHuman = 0,
    this.contactsToday = 0,
    this.unreadAlerts = 0,
  });

  final int overdue;
  final int dueToday;
  final int upcoming;
  final int open;
  final int closed;
  final int needsHuman;
  final int contactsToday;
  final int unreadAlerts;

  factory BoardCounts.fromJson(Map<String, dynamic> j) => BoardCounts(
    overdue: (j['overdue'] as num?)?.toInt() ?? 0,
    dueToday: (j['dueToday'] as num?)?.toInt() ?? 0,
    upcoming: (j['upcoming'] as num?)?.toInt() ?? 0,
    open: (j['open'] as num?)?.toInt() ?? 0,
    closed: (j['closed'] as num?)?.toInt() ?? 0,
    needsHuman: (j['needsHuman'] as num?)?.toInt() ?? 0,
    contactsToday: (j['contactsToday'] as num?)?.toInt() ?? 0,
    unreadAlerts: (j['unreadAlerts'] as num?)?.toInt() ?? 0,
  );
}

class FollowUpBoard {
  const FollowUpBoard({required this.scope, required this.followUps, required this.counts});

  final String scope;
  final List<ClinicalFollowUp> followUps;
  final BoardCounts counts;

  factory FollowUpBoard.fromJson(Map<String, dynamic> j) => FollowUpBoard(
    scope: '${j['scope'] ?? 'open'}',
    followUps: (j['followUps'] as List? ?? const <dynamic>[])
        .map((dynamic e) => ClinicalFollowUp.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false),
    counts: BoardCounts.fromJson(
        (j['counts'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{}),
  );
}

class Worklist {
  const Worklist({
    required this.counts,
    required this.overdue,
    required this.dueToday,
    required this.today,
  });

  final BoardCounts counts;
  final List<ClinicalFollowUp> overdue;
  final List<ClinicalFollowUp> dueToday;
  final String today;

  factory Worklist.fromJson(Map<String, dynamic> j) => Worklist(
    counts: BoardCounts.fromJson(
        (j['counts'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{}),
    overdue: (j['overdue'] as List? ?? const <dynamic>[])
        .map((dynamic e) => ClinicalFollowUp.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false),
    dueToday: (j['dueToday'] as List? ?? const <dynamic>[])
        .map((dynamic e) => ClinicalFollowUp.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false),
    today: '${j['today'] ?? ''}',
  );
}

/// A labelled option from the server, so the UI never hard-codes clinical terms.
class LabelledOption {
  const LabelledOption(this.value, this.label);
  final String value;
  final String label;

  factory LabelledOption.fromJson(Map<String, dynamic> j) =>
      LabelledOption('${j['value']}', '${j['label']}');
}
