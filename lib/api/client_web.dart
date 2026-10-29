import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

/// Cookies are only sent cross-origin when withCredentials is true.
http.Client createClient() => BrowserClient()..withCredentials = true;