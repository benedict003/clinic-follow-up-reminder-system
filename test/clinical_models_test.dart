// Contract test: the exact JSON the clinical API returned in a live run must
// parse into the models the screens render. If a field is renamed on the server
// this fails here instead of showing "null" to a nurse at the desk.
//
// Payloads below are trimmed copies of real responses from:
//   GET /api/clinical/follow-ups?scope=open
//   GET /api/clinical/follow-ups/1
//   GET /api/clinical/worklist
import 'package:flutter_test/flutter_test.dart';

import 'package:clinic_follow_up_reminder_system/models/clinical.dart';

void main() {
  test('board row parses with overdue state derived from the server', () {
    final ClinicalFollowUp f = ClinicalFollowUp.fromJson(<String, dynamic>{
      'id': 1,
      'patientId': '2026-00010',
      'patientName': 'Fictional Student J',
      'patientCategory': 'student',
      'contactNumber': '+63 900 000 0010',
      'dueDate': '2026-11-20',
      'reason': 'BP recheck after medication change',
      'status': 'scheduled',
      'version': 1,
      'createdAt': '2026-11-24T04:48:02.322Z',
      'contactAttempts': 1,
      'lastContactAt': '2026-11-24 12:48:15',
      'closedAt': null,
      'closeOutcome': null,
      'closeNote': null,
      'daysFromToday': -4,
      'overdue': true,
      'dueToday': false,
      'actions': <String, dynamic>{
        'canContact': true,
        'canReschedule': true,
        'canClose': true,
        'canQueueReminder': true,
      },
    });

    expect(f.id, 1);
    expect(f.status, FollowUpStatus.scheduled);
    expect(f.isOpen, isTrue);
    expect(f.overdue, isTrue);
    expect(f.contactAttempts, 1);
    expect(f.canQueueReminder, isTrue);
    // -4 days is the label a clinician reads, not a raw offset.
    expect(f.due.label, '4 days overdue');
    expect(f.due.urgent, isTrue);
  });

  test('a closed row reads as closed and is not urgent', () {
    final ClinicalFollowUp f = ClinicalFollowUp.fromJson(<String, dynamic>{
      'id': 2,
      'patientId': '2026-00010',
      'patientName': 'Fictional Student J',
      'dueDate': '2026-12-05',
      'reason': 'Wound review',
      'status': 'closed',
      'version': 1,
      'daysFromToday': 11,
      'closedAt': '2026-11-24 12:48:16',
      'closeOutcome': 'attended',
      'overdue': false,
    });

    expect(f.status, FollowUpStatus.closed);
    expect(f.isOpen, isFalse);
    expect(f.closeOutcome, 'attended');
    expect(f.due.label, 'Closed');
    expect(f.due.urgent, isFalse);
  });

  test('due-state wording covers today, tomorrow and later', () {
    ClinicalFollowUp at(int days, {FollowUpStatus status = FollowUpStatus.scheduled}) =>
        ClinicalFollowUp(
          id: 1,
          patientId: 'p',
          patientName: 'P',
          dueDate: '2026-11-24',
          reason: 'r',
          status: status,
          version: 1,
          daysFromToday: days,
        );

    expect(at(0).due.label, 'Due today');
    expect(at(1).due.label, 'Due tomorrow');
    expect(at(3).due.label, 'In 3 days');
    expect(at(-1).due.label, '1 day overdue');
  });

  test('detail parses the record, patient, history and jobs', () {
    final FollowUpDetail d = FollowUpDetail.fromJson(<String, dynamic>{
      'followUp': <String, dynamic>{
        'id': 1,
        'patientId': '2026-00010',
        'patientName': 'Fictional Student J',
        'dueDate': '2026-11-26',
        'reason': 'BP recheck after medication change',
        'status': 'reminded',
        'version': 2,
        'daysFromToday': 2,
        'contactAttempts': 2,
        'overdue': false,
      },
      'patient': <String, dynamic>{
        'id': '2026-00010',
        'name': 'Fictional Student J',
        'category': 'student',
        'contactNumber': '+63 900 000 0010',
        'birthDate': null,
        'sex': null,
        'openFollowUps': 1,
      },
      'events': <dynamic>[
        <String, dynamic>{
          'id': 1,
          'kind': 'contacted',
          'outcome': 'no_answer',
          'note': 'Called the number on file; rang out.',
          'fromDue': null,
          'toDue': null,
          'actorName': 'Doctor One',
          'actorRole': 'doctor',
          'createdAt': '2026-11-24 12:48:15',
        },
        <String, dynamic>{
          'id': 3,
          'kind': 'rescheduled',
          'outcome': null,
          'note': 'Patient asked for the 26th.',
          'fromDue': '2026-11-20',
          'toDue': '2026-11-26',
          'actorName': 'Doctor One',
          'actorRole': 'doctor',
          'createdAt': '2026-11-24 12:48:16',
        },
      ],
      'jobs': <dynamic>[
        <String, dynamic>{
          'id': 4,
          'status': 'obsolete',
          'attempts': 0,
          'maxAttempts': 4,
          'lastErrorCode': 'SUPERSEDED',
          'createdAt': '2026-11-24T04:48:30.000Z',
          'updatedAt': '2026-11-24T04:49:00.000Z',
        },
      ],
    });

    expect(d.followUp.status, FollowUpStatus.reminded);
    expect(d.followUp.version, 2);
    expect(d.patient.initials, 'FJ');
    expect(d.patient.contactNumber, '+63 900 000 0010');
    expect(d.events, hasLength(2));
    expect(d.events.first.title, 'Called, no answer');
    expect(d.events.last.title, 'Rescheduled');
    expect(d.events.last.detail, '2026-11-20 → 2026-11-26');
    expect(d.jobs.single.status, 'obsolete');
    expect(d.jobs.single.lastErrorCode, 'SUPERSEDED');
  });

  test('worklist counts and lists parse', () {
    final Worklist w = Worklist.fromJson(<String, dynamic>{
      'counts': <String, dynamic>{
        'overdue': 1,
        'dueToday': 2,
        'upcoming': 5,
        'open': 6,
        'needsHuman': 0,
        'queued': 0,
        'succeeded': 3,
        'contactsToday': 4,
        'unreadAlerts': 0,
      },
      'overdue': <dynamic>[],
      'dueToday': <dynamic>[],
      'today': '2026-11-24',
    });

    expect(w.counts.overdue, 1);
    expect(w.counts.dueToday, 2);
    expect(w.counts.contactsToday, 4);
    expect(w.today, '2026-11-24');
    expect(w.overdue, isEmpty);
  });

  test('an unknown status falls back to scheduled instead of throwing', () {
    expect(statusFromJson('some_new_state'), FollowUpStatus.scheduled);
    expect(statusFromJson(null), FollowUpStatus.scheduled);
  });
}
