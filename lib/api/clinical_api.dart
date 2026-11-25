// lib/api/clinical_api.dart
//
// The clinical workflow endpoints (/api/clinical/*). Kept separate from
// SecureExchangeApi and ReminderApi so the Module 14 exchange path and the
// Module 13 queue are untouched by ordinary clinical edits.
import 'clinic_api.dart';
import '../models/clinical.dart';

class ClinicalApi {
  ClinicalApi._();
  static final ClinicalApi instance = ClinicalApi._();

  ClinicApi get _api => ClinicApi.instance;

  /// scope: open | overdue | today | upcoming | closed
  Future<FollowUpBoard> board({String scope = 'open', String q = ''}) async {
    final List<String> params = <String>['scope=$scope'];
    if (q.trim().isNotEmpty) params.add('q=${Uri.encodeQueryComponent(q.trim())}');
    final Map<String, dynamic> data =
    await _api.request('GET', '/api/clinical/follow-ups?${params.join('&')}');
    return FollowUpBoard.fromJson(data);
  }

  Future<FollowUpDetail> detail(int id) async {
    final Map<String, dynamic> data =
    await _api.request('GET', '/api/clinical/follow-ups/$id');
    return FollowUpDetail.fromJson(data);
  }

  Future<Worklist> worklist() async {
    final Map<String, dynamic> data = await _api.request('GET', '/api/clinical/worklist');
    return Worklist.fromJson(data);
  }

  /// outcome: reached | no_answer | voicemail | wrong_number
  Future<ClinicalFollowUp> logContact(int id, {required String outcome, String? note}) async {
    final Map<String, dynamic> data = await _api.request(
      'POST',
      '/api/clinical/follow-ups/$id/contact',
      body: <String, dynamic>{'outcome': outcome, 'note': note},
    );
    return ClinicalFollowUp.fromJson((data['followUp'] as Map).cast<String, dynamic>());
  }

  /// Returns how many queued reminders the new version superseded.
  Future<({ClinicalFollowUp followUp, int supersededJobs})> reschedule(
      int id, {required String dueDate, String? note}) async {
    final Map<String, dynamic> data = await _api.request(
      'POST',
      '/api/clinical/follow-ups/$id/reschedule',
      body: <String, dynamic>{'dueDate': dueDate, 'note': note},
    );
    return (
    followUp: ClinicalFollowUp.fromJson((data['followUp'] as Map).cast<String, dynamic>()),
    supersededJobs: (data['supersededJobs'] as num?)?.toInt() ?? 0,
    );
  }

  Future<ClinicalFollowUp> close(int id, {required String outcome, String? note}) async {
    final Map<String, dynamic> data = await _api.request(
      'POST',
      '/api/clinical/follow-ups/$id/close',
      body: <String, dynamic>{'outcome': outcome, 'note': note},
    );
    return ClinicalFollowUp.fromJson((data['followUp'] as Map).cast<String, dynamic>());
  }

  Future<void> addNote(int id, String note) =>
      _api.request('POST', '/api/clinical/follow-ups/$id/note',
          body: <String, dynamic>{'note': note});

  Future<List<ClinicalPatient>> patients({String q = ''}) async {
    final String query = q.trim().isEmpty ? '' : '?q=${Uri.encodeQueryComponent(q.trim())}';
    final Map<String, dynamic> data =
    await _api.request('GET', '/api/clinical/patients$query');
    return (data['patients'] as List? ?? const <dynamic>[])
        .map((dynamic p) => ClinicalPatient.fromJson((p as Map).cast<String, dynamic>()))
        .toList(growable: false);
  }

  Future<ClinicalPatient> createPatient({
    required String id,
    required String name,
    required String category,
    String? contactNumber,
  }) async {
    final Map<String, dynamic> data = await _api.request('POST', '/api/clinical/patients', body: <String, dynamic>{
      'id': id,
      'name': name,
      'category': category,
      'contactNumber': contactNumber,
    });
    return ClinicalPatient.fromJson((data['patient'] as Map).cast<String, dynamic>());
  }

  /// Clinical vocabulary, fetched rather than hard-coded in the UI.
  Future<({List<LabelledOption> contactOutcomes, List<LabelledOption> closeOutcomes, String today})> meta() async {
    final Map<String, dynamic> data = await _api.request('GET', '/api/clinical/meta');
    List<LabelledOption> parse(Object? raw) => (raw as List? ?? const <dynamic>[])
        .map((dynamic o) => LabelledOption.fromJson((o as Map).cast<String, dynamic>()))
        .toList(growable: false);
    return (
    contactOutcomes: parse(data['contactOutcomes']),
    closeOutcomes: parse(data['closeOutcomes']),
    today: '${data['today'] ?? ''}',
    );
  }
}
