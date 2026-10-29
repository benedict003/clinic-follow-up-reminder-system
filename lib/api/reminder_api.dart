import 'clinic_api.dart';

class ReminderJob {
  ReminderJob(this.json);
  final Map<String, dynamic> json;

  int get id => (json['id'] as num).toInt();
  int get followUpId => (json['followUpId'] as num).toInt();
  String get status => '${json['status']}';
  int get attempts => (json['attempts'] as num).toInt();
  int get maxAttempts => (json['maxAttempts'] as num).toInt();
  String get correlationId => '${json['correlationId']}';
  String? get lastErrorCode => json['lastErrorCode']?.toString();
  String? get lastErrorText => json['lastErrorText']?.toString();
  String? get patientName => json['patientName']?.toString();
}

class ReminderApi {
  ReminderApi._();
  static final ReminderApi instance = ReminderApi._();

  Future<Map<String, dynamic>> jobs({String status = ''}) {
    final q = status.isEmpty ? '' : '?status=$status';
    return ClinicApi.instance.request('GET', '/api/reminder-jobs$q');
  }

  Future<Map<String, dynamic>> job(int id) =>
      ClinicApi.instance.request('GET', '/api/reminder-jobs/$id');

  Future<Map<String, dynamic>> enqueue(int followUpId) =>
      ClinicApi.instance.request('POST', '/api/reminder-jobs',
          body: {'followUpId': followUpId});

  Future<Map<String, dynamic>> retry(int id, String reason) =>
      ClinicApi.instance.request('POST', '/api/reminder-jobs/$id/retry',
          body: {'reason': reason});

  Future<Map<String, dynamic>> acknowledge(int id) =>
      ClinicApi.instance.request('POST', '/api/reminder-jobs/$id/acknowledge',
          body: const {});

  Future<List<dynamic>> followUps({String status = ''}) async {
    final q = status.isEmpty ? '' : '?status=$status';
    final data = await ClinicApi.instance.request('GET', '/api/follow-ups$q');
    return (data['followUps'] as List?) ?? const [];
  }

  Future<Map<String, dynamic>> createFollowUp({
    required String patientId,
    required String dueDate,
    required String reason,
  }) async {
    final data = await ClinicApi.instance.request('POST', '/api/follow-ups', body: {
      'patientId': patientId,
      'dueDate': dueDate,
      'reason': reason,
    });
    return (data['followUp'] as Map).cast<String, dynamic>();
  }

  Future<List<dynamic>> patients() async {
    final data = await ClinicApi.instance.request('GET', '/api/patients');
    return (data['patients'] as List?) ?? const [];
  }
}