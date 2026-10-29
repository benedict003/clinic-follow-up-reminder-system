import 'package:flutter/foundation.dart';

class AppConfig {
  static const int port = 3400;

  /// Empty = derive from platform. Set to e.g. 'http://192.168.1.20:3400' for a phone.
  static const String hostOverride = '';

  static String get defaultBaseUrl {
    if (hostOverride.isNotEmpty) return hostOverride;
    if (kIsWeb) return 'http://localhost:$port';
    if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:$port';
    return 'http://localhost:$port';
  }

  static const Duration requestTimeout = Duration(seconds: 25);
}