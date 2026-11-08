import 'clinic_api.dart';

/// Secure exchange endpoints.
///
/// Uses the shared ClinicApi.instance, so this screen inherits the session
/// cookie and CSRF token without wiring of its own.
class SecureExchangeApi {
  Future<Map<String, dynamic>> keyInfo() =>
      ClinicApi.instance.request('GET', '/api/secure/keyinfo');

  Future<Map<String, dynamic>> preview(int followUpId) =>
      ClinicApi.instance.request('GET', '/api/secure/preview/$followUpId');

  Future<Map<String, dynamic>> send(int followUpId) =>
      ClinicApi.instance.request('POST', '/api/secure/send/$followUpId');

  Future<List<Map<String, dynamic>>> history() async {
    final Map<String, dynamic> data =
    await ClinicApi.instance.request('GET', '/api/secure/messages');
    return (data['messages'] as List? ?? const <dynamic>[])
        .cast<Map<String, dynamic>>();
  }

  /// Only scheduled follow-ups can be disclosed.
  ///
  /// service.js publicFollowUp() returns camelCase, so this reads `status` and
  /// `dueDate` — not the snake_case column names.
  Future<List<Map<String, dynamic>>> disclosableFollowUps() async {
    final Map<String, dynamic> data =
    await ClinicApi.instance.request('GET', '/api/follow-ups');
    final List<dynamic> raw = data['followUps'] as List? ?? const <dynamic>[];
    return raw
        .cast<Map<String, dynamic>>()
        .where((Map<String, dynamic> m) => m['status'] == 'scheduled')
        .toList(growable: false);
  }
}