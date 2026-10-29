import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';

import 'client_factory.dart';

class ApiException implements Exception {
  ApiException(this.message, [this.status]);
  final String message;
  final int? status;
  @override
  String toString() => message;
}

class SessionExpiredException extends ApiException {
  SessionExpiredException() : super('Your session ended. Sign in again.', 401);
}

class ClinicApi {
  ClinicApi._();
  static final ClinicApi instance = ClinicApi._();

  final http.Client _client = createClient();
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static const _kBaseUrl = 'cfr.baseUrl';
  static const _kCookie = 'cfr.session';
  static const _kCsrf = 'cfr.csrf';
  static const String _browserCookie = 'browser-managed';
  static final RegExp _cookiePattern = RegExp(r'cfr_session=([a-f0-9]{64})');

  String baseUrl = AppConfig.defaultBaseUrl;

  String? _sessionToken;
  String? _csrfToken;
  Map<String, dynamic>? user;
  VoidCallback? onSessionExpired;

  bool get signedIn => user != null;
  String get role => user?['role']?.toString() ?? '';
  bool get isDoctor => role == 'doctor';
  String get displayName => user?['name']?.toString() ?? '';

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> _headers({bool write = false, bool json = false}) => {
    'Accept': 'application/json',
    if (json) 'Content-Type': 'application/json',
    // Web: `Cookie` is a forbidden request header. Same-origin serving means
    // the browser sends cfr_session by itself.
    if (_sessionToken != null && !kIsWeb)
      'Cookie': 'cfr_session=$_sessionToken',
    if (write && _csrfToken != null) 'X-CSRF-Token': _csrfToken!,
  };

  /// Public passthrough used by feature API clients.
  Future<Map<String, dynamic>> request(
      String method,
      String path, {
        Map<String, dynamic>? body,
      }) =>
      _request(method, path, body: body);

  Future<Map<String, dynamic>> _request(
      String method,
      String path, {
        Map<String, dynamic>? body,
      }) async {
    final write = method != 'GET';
    try {
      final res = await _client
          .send(http.Request(method, _uri(path))
        ..headers.addAll(_headers(write: write, json: write))
        ..body = write ? jsonEncode(body ?? const <String, dynamic>{}) : '')
          .then(http.Response.fromStream)
          .timeout(AppConfig.requestTimeout);
      return _decode(res);
    } on TimeoutException {
      throw ApiException('$baseUrl did not answer within '
          '${AppConfig.requestTimeout.inSeconds}s. Is the backend running?');
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException('Cannot reach $baseUrl\n$e');
    }
  }

  Map<String, dynamic> _decode(http.Response res) {
    if (res.statusCode == 401) {
      onSessionExpired?.call();
      throw SessionExpiredException();
    }
    dynamic data;
    try {
      data = res.body.trim().isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
    } catch (_) {
      data = {'error': res.body};
    }
    if (res.statusCode >= 400) {
      final msg = data is Map && data['error'] != null
          ? data['error'].toString()
          : 'Request failed (HTTP ${res.statusCode}).';
      throw ApiException(msg, res.statusCode);
    }
    return data is Map ? data.cast<String, dynamic>() : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> health() async {
    final data = await _request('GET', '/api/health');
    return data;
  }

  Future<String> probe(String url) async {
    final saved = baseUrl;
    baseUrl = url.replaceAll(RegExp(r'/+$'), '');
    try {
      final d = await health();
      return 'Connected · ${d['service'] ?? 'backend'} · ${d['time'] ?? ''}';
    } on ApiException catch (e) {
      if (e.status == 404) return 'Connected to $baseUrl (no /api/health endpoint)';
      baseUrl = saved;
      rethrow;
    } catch (_) {
      baseUrl = saved;
      rethrow;
    }
  }

  Future<void> setBaseUrl(String url) async {
    baseUrl = url.replaceAll(RegExp(r'/+$'), '');
    try {
      await _storage.write(key: _kBaseUrl, value: baseUrl);
    } catch (e) {
      debugPrint('storage skipped ($e)');
    }
  }

  Future<void> login(String username, String password) async {
    final res = await _client
        .post(_uri('/api/login'),
        headers: const {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'username': username.trim(), 'password': password}))
        .timeout(AppConfig.requestTimeout);

    final data = _decode(res);

    // Web: `Set-Cookie` is a forbidden response header — the browser stores the
    // cookie but never exposes it to Dart. Trust the browser's jar there.
    final token = _cookiePattern.firstMatch(res.headers['set-cookie'] ?? '')?.group(1);
    if (token == null && !kIsWeb) {
      throw ApiException('The server did not send a cfr_session cookie.');
    }

    _sessionToken = token ?? _browserCookie;
    _csrfToken = data['csrfToken']?.toString();
    user = (data['user'] as Map?)?.cast<String, dynamic>();
    await _persist();
  }

  Future<bool> resume() async {
    try {
      baseUrl = await _storage.read(key: _kBaseUrl) ?? baseUrl;
      _sessionToken ??= await _storage.read(key: _kCookie);
      _csrfToken ??= await _storage.read(key: _kCsrf);
    } catch (e) {
      debugPrint('storage read skipped ($e)');
    }

    // Web: the cookie lives in the browser jar even when secure storage is empty,
    // so always probe /api/session there.
    if (_sessionToken == null && !kIsWeb) return false;

    try {
      final data = await _request('GET', '/api/session');
      user = (data['user'] as Map?)?.cast<String, dynamic>();
      _csrfToken = data['csrfToken']?.toString() ?? _csrfToken;
      await _persist();
      return user != null;
    } on SessionExpiredException {
      await signOut();
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<void> signOut() async {
    if (_sessionToken != null || kIsWeb) {
      try {
        await _request('POST', '/api/logout');
      } catch (_) {}
    }
    _sessionToken = null;
    _csrfToken = null;
    user = null;
    try {
      await _storage.delete(key: _kCookie);
      await _storage.delete(key: _kCsrf);
    } catch (e) {
      debugPrint('storage clear skipped ($e)');
    }
  }

  Future<void> _persist() async {
    try {
      await _storage.write(key: _kBaseUrl, value: baseUrl);
      if (_sessionToken != null && _sessionToken!.length == 64) {
        await _storage.write(key: _kCookie, value: _sessionToken);
      }
      if (_csrfToken != null) {
        await _storage.write(key: _kCsrf, value: _csrfToken);
      }
    } catch (e) {
      debugPrint('storage write skipped ($e)');
    }
  }
}