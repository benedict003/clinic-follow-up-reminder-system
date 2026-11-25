import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/clinic_api.dart';
import '../api/secure_api.dart';
import '../widgets/ui.dart';

/// Preview, seal, send and verify a minimised follow-up record.
///
/// Three steps, and the send action is unreachable until step two is complete:
/// a record cannot be sealed without having been reviewed. The client holds no
/// key material and never sees plaintext beyond the preview the server returns.
///
/// Nothing on this page may block navigation. It used to wrap itself in
/// `PopScope(canPop: !_busy)` and disable the Reload action while a load was in
/// flight, so a single slow request left the page unable to go back and unable
/// to reload - the only way out was refreshing the browser, which reads as a
/// frozen tab. Loading is now a non-blocking flag: the page stays usable, the
/// back arrow always works, and a request that never answers costs a banner,
/// not the session.
class SecureExchangeScreen extends StatefulWidget {
  const SecureExchangeScreen({super.key});

  @override
  State<SecureExchangeScreen> createState() => _SecureExchangeScreenState();
}

/// One load: key fingerprints, send history and the picker choices.
typedef _Loaded = ({
  Map<String, dynamic> info,
  List<Map<String, dynamic>> history,
  List<Map<String, dynamic>> choices,
});

class _SecureExchangeScreenState extends State<SecureExchangeScreen> {
  final SecureExchangeApi _secure = SecureExchangeApi();
  final TextEditingController _idController = TextEditingController();

  Map<String, dynamic>? _keyInfo;
  Map<String, dynamic>? _preview;
  Map<String, dynamic>? _result;
  List<Map<String, dynamic>> _history = const <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _choices = const <Map<String, dynamic>>[];

  /// List load in flight. Drives only a thin progress bar - never a disabled
  /// back button or a disabled Reload, which is what used to freeze the page.
  bool _loading = false;

  /// Preview/send in flight. Gates only the buttons that would overlap it.
  bool _busy = false;
  String _busyLabel = 'Working';
  String? _error;
  int? _previewedId;

  /// Hard ceiling on one load, so the page always returns to a usable state.
  static const Duration _loadBudget = Duration(seconds: 20);

  @override
  void initState() {
    super.initState();
    _idController.addListener(_onIdChanged);
    // After the first frame: _load() calls setState, which must not run while
    // this element is still being mounted.
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _idController.removeListener(_onIdChanged);
    _idController.dispose();
    super.dispose();
  }

  /// Changing the id invalidates the review beneath it. Without this the screen
  /// would let record 4 be reviewed and record 5 be sent.
  void _onIdChanged() {
    if (_previewedId == null) return;
    final int? id = int.tryParse(_idController.text.trim());
    if (id != _previewedId) {
      setState(() {
        _preview = null;
        _previewedId = null;
      });
    }
  }

  bool get _doctor => ClinicApi.instance.isDoctor;
  bool get _reviewed => _preview != null && _previewedId != null;
  bool get _disclosable => _preview?['disclosable'] == true;
  bool get _canSend => !_busy && _doctor && _reviewed && _disclosable;

  Future<void> _load() async {
    if (_loading) return;
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      _loading = true;
    }

    try {
      final _Loaded loaded = await _fetch().timeout(_loadBudget);
      if (!mounted) return;
      setState(() {
        _keyInfo = loaded.info;
        _history = loaded.history;
        _choices = loaded.choices;
        _loading = false;
      });
    } on TimeoutException {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'The server did not answer within ${_loadBudget.inSeconds}s. '
            'Check that the backend is running, then tap Reload.';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (e) {
      // Anything unexpected still has to release the page.
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Unexpected error while loading: $e';
      });
    }
  }

  /// All three requests start together: one slow call must not make the other
  /// two queue behind it and turn a 25s stall into a 75s one.
  Future<_Loaded> _fetch() async {
    final Future<Map<String, dynamic>> info = _secure.keyInfo();

    Future<List<Map<String, dynamic>>> history() async {
      if (!_doctor) return const <Map<String, dynamic>>[];
      try {
        return await _secure.history();
      } on ApiException catch (e) {
        // A nurse may preview but not read who has been disclosed. That is a
        // role boundary, not a failure, so it must not paint a red banner.
        if (e.status == 403) return const <Map<String, dynamic>>[];
        rethrow;
      }
    }

    Future<List<Map<String, dynamic>>> choices() async {
      try {
        return await _secure.disclosableFollowUps();
      } on ApiException {
        // The picker is a convenience; manual entry still works without it.
        return const <Map<String, dynamic>>[];
      }
    }

    // Future.wait listens to all three, so a failure in one cannot surface as
    // an unhandled error from the other two.
    final List<Object?> parts = await Future.wait<Object?>(
      <Future<Object?>>[info, history(), choices()],
    );

    return (
      info: parts[0]! as Map<String, dynamic>,
      history: parts[1]! as List<Map<String, dynamic>>,
      choices: parts[2]! as List<Map<String, dynamic>>,
    );
  }

  Future<void> _pickFollowUp() async {
    if (_choices.isEmpty) {
      setState(() => _error =
      'No scheduled follow-ups to choose from. Create one under Follow-ups.');
      return;
    }
    final Map<String, dynamic>? chosen =
    await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: <Widget>[
                  Text('Scheduled follow-ups',
                      style: Theme.of(sheetContext).textTheme.titleMedium),
                  const Spacer(),
                  Text('${_choices.length}',
                      style: Theme.of(sheetContext).textTheme.bodySmall),
                ],
              ),
            ),
            Flexible(
              // A shrink-wrapping ListView is a RenderShrinkWrappingViewport,
              // which hit-tests its slivers through `child.geometry!`. When the
              // sheet is opened, resized or dismissed, that geometry can still
              // be null and every tap then throws inside the framework. A
              // single-child scroll view has no slivers, so it cannot.
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    for (final Map<String, dynamic> f in _choices)
                      ListTile(
                        leading: const CircleAvatar(
                          radius: 14,
                          child: Icon(Icons.event_available, size: 16),
                        ),
                        title: Text('Follow-up #${f['id']}'),
                        subtitle: Text(
                            'due ${f['dueDate']} - ${f['reason'] ?? ''}'),
                        onTap: () => Navigator.of(sheetContext).pop(f),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
    if (chosen == null || !mounted) return;
    _idController.text = '${chosen['id']}';
    await _previewRecord();
  }

  Future<void> _previewRecord() async {
    final int? id = int.tryParse(_idController.text.trim());
    if (id == null || id < 1) {
      setState(() => _error = 'Choose a follow-up or enter a positive id.');
      return;
    }
    setState(() {
      _busy = true;
      _busyLabel = 'Previewing';
      _error = null;
      _result = null;
    });
    try {
      final Map<String, dynamic> p = await _secure.preview(id);
      if (!mounted) return;
      setState(() {
        _preview = p;
        _previewedId = id;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _preview = null;
        _previewedId = null;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _confirmSend(int id) async {
    final bool? answer = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        icon: const Icon(Icons.lock_outline),
        title: const Text('Send outside the clinic?'),
        content: Text(
          'A sealed envelope for follow-up #$id will be sent to the partner. '
              'Patient identity, patient id and clinical reason are not included.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Send'),
          ),
        ],
      ),
    );
    return answer ?? false;
  }

  Future<void> _send() async {
    final int? id = _previewedId;
    if (id == null || !_canSend) return;

    final bool confirmed = await _confirmSend(id);
    if (!confirmed || !mounted) return;

    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    setState(() {
      _busy = true;
      _busyLabel = 'Sealing';
      _error = null;
    });
    try {
      final Map<String, dynamic> out = await _secure.send(id);
      if (!mounted) return;
      setState(() => _result = out);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(out['ok'] == true
                ? 'Sealed and delivered.'
                : 'Rejected by the receiver.'),
          ),
        );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _copy(String label, String value) {
    if (value.isEmpty) return;
    Clipboard.setData(ClipboardData(text: value));
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text('$label copied'),
        duration: const Duration(seconds: 2),
      ));
  }

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.sizeOf(context).width;
    final double pad = width >= 720 ? 24 : 16;

    return Scaffold(
      appBar: appBar('Secure exchange', actions: <Widget>[
        IconButton(
          tooltip: 'Reload',
          // Never disabled: a disabled Reload turns a slow load into a freeze.
          onPressed: _load,
          icon: _loading
              ? const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: Colors.white),
          )
              : const Icon(Icons.refresh),
        ),
      ]),
      body: Column(
        children: <Widget>[
          // Thin and non-blocking; it never covers or disables the page.
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              // SingleChildScrollView, not ListView. A ListView is a
              // RenderViewport and hit-tests its sliver children through
              // `child.geometry!` (viewport.dart:1031). If one sliver has not
              // been laid out yet, that null check throws on EVERY pointer
              // packet - nothing on the page responds, no tap, no scroll, and
              // the tab looks frozen while still painting. A single-child
              // scroll view hit-tests a plain RenderBox and cannot hit that
              // path. This page has ~20 children, so lazy building buys
              // nothing here.
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.symmetric(horizontal: pad, vertical: pad),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 860),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        if (_error != null) ...<Widget>[
                          _banner(_error!),
                          const SizedBox(height: 12),
                        ],
                        _keyStrip(),
                        const SizedBox(height: 12),
                        _stepOne(),
                        const SizedBox(height: 12),
                        if (_reviewed) ...<Widget>[
                          _stepTwo(),
                          const SizedBox(height: 12),
                        ],
                        if (_result != null) ...<Widget>[
                          _resultCard(),
                          const SizedBox(height: 12),
                        ],
                        _historyCard(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: _actionBar(),
    );
  }

  // ── fingerprint strip ──────────────────────────────────────────────────────

  Widget _keyStrip() {
    final Map<String, dynamic> keys =
        (_keyInfo?['keys'] as Map?)?.cast<String, dynamic>() ??
            <String, dynamic>{};
    final String keyId = (_keyInfo?['keyId'] ?? '-').toString();
    final dynamic decrypt = keys['recipientDecrypt'];
    final bool canDecrypt = decrypt is Map && decrypt['present'] == true;
    final ColorScheme scheme = Theme.of(context).colorScheme;

    Widget chip(String label, String value, {Color? background}) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: (background ?? scheme.surfaceContainerHighest)
            .withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        '$label $value',
        style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
      ),
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // Wrap, not Row: the title plus a fingerprint chip overflowed by
            // 67px at 380px wide. A Wrap simply moves the chip to a second line.
            Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: <Widget>[
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    const Icon(Icons.fingerprint, size: 18),
                    const SizedBox(width: 8),
                    Text('This process holds',
                        style: Theme.of(context).textTheme.titleSmall),
                  ],
                ),
                chip('keyId', keyId),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                for (final String name in <String>[
                  'senderSigning',
                  'senderVerify',
                  'recipientEncrypt',
                ])
                  chip(
                    name,
                    (keys[name] is Map && keys[name]['present'] == true)
                        ? '${keys[name]['fingerprint']}'
                        : 'absent',
                  ),
                chip(
                  'recipientDecrypt',
                  canDecrypt ? 'PRESENT' : 'absent',
                  background: canDecrypt ? scheme.errorContainer : null,
                ),
              ],
            ),
            if (canDecrypt) ...<Widget>[
              const SizedBox(height: 10),
              Text(
                'This process can decrypt what it sends, so the separation of '
                    'duties is not enforced by file access. Recorded as a limitation.',
                style: TextStyle(fontSize: 12, color: scheme.error),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ── step 1 ─────────────────────────────────────────────────────────────────

  Widget _stepOne() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _stepTitle('1', 'Choose a record'),
            const SizedBox(height: 4),
            Text(
              'Only a scheduled follow-up can be disclosed.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            LayoutBuilder(builder: (BuildContext ctx, BoxConstraints c) {
              final Widget field = TextField(
                controller: _idController,
                enabled: !_busy,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _previewRecord(),
                decoration: const InputDecoration(
                  labelText: 'Follow-up ID',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              );
              final Widget picker = IconButton.filledTonal(
                tooltip: 'Choose from scheduled follow-ups',
                onPressed: _busy ? null : _pickFollowUp,
                icon: const Icon(Icons.list_alt),
              );
              // minimumSize MUST be overridden here. The theme sets
              // Size.fromHeight(48), i.e. minWidth = infinity, which stretches
              // a button to its parent's width - fine in a Column, fatal in a
              // Row, where the width is unbounded: layout then throws
              // "BoxConstraints forces an infinite width", the whole Scaffold
              // aborts its layout, and every later tap dies in hit-testing
              // ("Cannot hit test a render box that has never been laid out").
              final Widget preview = FilledButton.tonal(
                style: FilledButton.styleFrom(
                  minimumSize: const Size(64, 48),
                ),
                onPressed: _busy ? null : _previewRecord,
                child: Text(_reviewed ? 'Re-preview' : 'Preview'),
              );

              // Phone width: the field on its own line, so the row cannot
              // overflow (it did by 67px at 380px before this).
              if (c.maxWidth < 520) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    field,
                    const SizedBox(height: 8),
                    Row(
                      children: <Widget>[
                        picker,
                        const SizedBox(width: 8),
                        Expanded(child: preview),
                      ],
                    ),
                  ],
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(child: field),
                  const SizedBox(width: 8),
                  picker,
                  const SizedBox(width: 4),
                  preview,
                ],
              );
            }),
          ],
        ),
      ),
    );
  }

  // ── step 2 ─────────────────────────────────────────────────────────────────

  Widget _stepTwo() {
    final Map<String, dynamic> p = _preview!;
    final List<dynamic> withheld = (p['withheld'] as List?) ??
        (_keyInfo?['withheld'] as List?) ??
        const <dynamic>[];
    final bool ok = p['disclosable'] == true;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _stepTitle('2', 'Review what leaves'),
            const SizedBox(height: 4),
            Text(
              'Follow-up #$_previewedId - status ${p['status']}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            LayoutBuilder(builder: (BuildContext ctx, BoxConstraints c) {
              final Widget included = _includedPanel(p);
              final Widget excluded = _withheldPanel(withheld);
              if (c.maxWidth < 560) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    included,
                    const SizedBox(height: 14),
                    excluded,
                  ],
                );
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(child: included),
                  const SizedBox(width: 16),
                  Expanded(child: excluded),
                ],
              );
            }),
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Theme.of(context)
                    .colorScheme
                    .surfaceContainerHighest
                    .withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'Sealed with AES-256-GCM, signed with Ed25519, data key wrapped '
                    'with RSA-OAEP-256, delivered over pinned TLS.',
                style: TextStyle(fontSize: 12, fontFamily: 'monospace'),
              ),
            ),
            if (!ok) ...<Widget>[
              const SizedBox(height: 10),
              Text(
                'This follow-up is ${p['status']} and cannot be disclosed.',
                style: TextStyle(
                    color: Theme.of(context).colorScheme.error, fontSize: 13),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _includedPanel(Map<String, dynamic> p) {
    final List<dynamic> fields = p['fields'] as List? ?? const <dynamic>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Included',
            style: Theme.of(context)
                .textTheme
                .labelLarge
                ?.copyWith(color: Colors.green.shade800)),
        const SizedBox(height: 6),
        DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).dividerColor),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Column(
              children: <Widget>[
                for (final dynamic f in fields) _fieldRow(f),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text('${p['plaintextBytes']} bytes before sealing',
            style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }

  Widget _fieldRow(dynamic raw) {
    final Map<String, dynamic> f = (raw as Map).cast<String, dynamic>();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 92,
            child: Text('${f['name']}',
                style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(
            child: SelectableText(
              '${f['value']}',
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _withheldPanel(List<dynamic> withheld) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Withheld (${withheld.length})',
            style: Theme.of(context)
                .textTheme
                .labelLarge
                ?.copyWith(color: Theme.of(context).colorScheme.error)),
        const SizedBox(height: 6),
        DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).dividerColor),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                for (final dynamic n in withheld)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: <Widget>[
                        Icon(Icons.block,
                            size: 13,
                            color: Theme.of(context).colorScheme.outline),
                        const SizedBox(width: 8),
                        Text('$n',
                            style: const TextStyle(
                                fontFamily: 'monospace', fontSize: 12)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text('These stay in the clinic and never reach the partner.',
            style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }

  // ── result ─────────────────────────────────────────────────────────────────

  Widget _resultCard() {
    final Map<String, dynamic> r = _result!;
    final bool ok = r['ok'] == true;
    final Map<String, dynamic> env =
        (r['envelope'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    final Map<String, dynamic> alg = (env['algorithm'] as Map?)
        ?.cast<String, dynamic>() ??
        <String, dynamic>{};
    final Map<String, dynamic>? receipt =
    (r['receipt'] as Map?)?.cast<String, dynamic>();
    final Map<String, dynamic>? error =
    (r['error'] as Map?)?.cast<String, dynamic>();
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final String messageId = (env['messageId'] ?? '').toString();
    final String digest = (env['payloadSha256'] ?? '').toString();

    return Card(
      color: ok
          ? scheme.secondaryContainer.withValues(alpha: 0.35)
          : scheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(ok ? Icons.verified_user : Icons.gpp_bad,
                    color: ok ? Colors.green.shade800 : scheme.error),
                const SizedBox(width: 8),
                Text(ok ? 'Delivered' : 'Rejected',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                const Spacer(),
                Text('HTTP ${r['status'] ?? '-'}',
                    style: const TextStyle(
                        fontFamily: 'monospace', fontSize: 12)),
              ],
            ),
            const SizedBox(height: 10),
            if (ok) ...<Widget>[
              _kv('messageId', messageId,
                  copy: () => _copy('messageId', messageId)),
              _kv(
                  'algorithm',
                  '${alg['payload']} / ${alg['signature']} / ${alg['key']}'),
              _kv(
                  'size',
                  '${env['plaintextBytes']} B plaintext -> '
                      '${env['ciphertextBytes']} B ciphertext'),
              _kv('sha256', digest, copy: () => _copy('sha256', digest)),
              _kv('keyId', '${env['keyId'] ?? '-'}'),
              if (receipt != null)
                _kv(
                    'receipt',
                    '${receipt['receivedAt']} - ${receipt['bytes']} B'),
              if (env['expiresAt'] != null)
                _kv('expiresAt', '${env['expiresAt']}'),
              const SizedBox(height: 6),
              Text(
                'The receiver verified the signature, the validity window and '
                    'the authentication tag, and returned a receipt with no payload.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ] else ...<Widget>[
              _kv('code', '${error?['code'] ?? 'UNKNOWN'}'),
              _kv('detail', '${error?['message'] ?? 'No detail returned.'}'),
              const SizedBox(height: 6),
              Text(
                'The receiver refused the envelope. Nothing was accepted and no '
                    'inbox row was created.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _kv(String label, String value, {VoidCallback? copy}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 88,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
          ),
          if (copy != null)
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Copy',
              onPressed: copy,
              icon: const Icon(Icons.copy, size: 15),
            ),
        ],
      ),
    );
  }

  // ── history ────────────────────────────────────────────────────────────────

  Widget _historyCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Text('Send history',
                    style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                Text('${_history.length}',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              _doctor
                  ? 'Metadata and a payload hash. No plaintext, no ciphertext stored.'
                  : 'Visible to a doctor. A nurse may preview a record but not '
                  'the disclosure history.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 10),
            // A plain Text, not EmptyView: EmptyView is a ListView and cannot be
            // a child of this page's ListView.
            if (_history.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 18),
                child: Center(
                  child: Text(
                    _doctor
                        ? 'No envelopes sent yet.'
                        : 'Not shown for this role.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              )
            else
              Column(
                children: <Widget>[
                  for (int i = 0; i < _history.length; i++) ...<Widget>[
                    if (i > 0) const Divider(height: 14),
                    _historyRow(_history[i]),
                  ],
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// history() returns raw SQL rows, so these keys stay snake_case - unlike the
  /// follow-up list, which publicFollowUp() maps to camelCase.
  Widget _historyRow(Map<String, dynamic> m) {
    final String status = (m['status'] ?? 'unknown').toString();
    final Color colour = switch (status) {
      'delivered' => Colors.green,
      'rejected' => Colors.orange,
      'failed' => Colors.red,
      _ => Colors.blueGrey,
    };
    final String prefix = (m['message_id'] ?? '').toString();
    final String code = (m['error_code'] ?? '').toString();
    final String short = prefix.length > 8 ? prefix.substring(0, 8) : prefix;

    return Row(
      children: <Widget>[
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                '$short  #${m['follow_up_id']}  $status',
                style:
                const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
              Text(
                '${m['plaintext_bytes']} B - '
                    '${code.isEmpty ? 'no error' : code} - '
                    'HTTP ${m['http_status'] ?? '-'}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          tooltip: 'Copy full message id',
          onPressed: () => _copy('messageId', prefix),
          icon: const Icon(Icons.copy, size: 15),
        ),
      ],
    );
  }

  // ── shared ─────────────────────────────────────────────────────────────────

  Widget _stepTitle(String number, String title) {
    return Row(
      children: <Widget>[
        CircleAvatar(
          radius: 11,
          backgroundColor: Theme.of(context).colorScheme.primary,
          child: Text(number,
              style: const TextStyle(fontSize: 12, color: Colors.white)),
        ),
        const SizedBox(width: 10),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
      ],
    );
  }

  Widget _banner(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.error_outline, size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }

  Widget _actionBar() {
    final ThemeData theme = Theme.of(context);
    final String hint;
    if (_loading) {
      hint = 'Loading key status and history...';
    } else if (!_doctor) {
      hint = 'Only a doctor can disclose a record to the partner.';
    } else if (!_reviewed) {
      hint = 'Preview a record first, so the send decision is made on the '
          'minimised payload rather than on an id.';
    } else if (!_disclosable) {
      hint = 'This follow-up is ${_preview?['status']} and cannot be disclosed.';
    } else if (_busy) {
      hint = '$_busyLabel...';
    } else {
      hint = 'Ready: ${_preview?['plaintextBytes']} bytes would leave the clinic.';
    }

    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(top: BorderSide(color: theme.dividerColor)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(
                  _canSend ? Icons.check_circle_outline : Icons.info_outline,
                  size: 15,
                  color:
                  _canSend ? Colors.green.shade800 : theme.colorScheme.outline,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    hint,
                    style: theme.textTheme.bodySmall,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _canSend ? _send : null,
                icon: _busy
                    ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
                    : const Icon(Icons.lock_outline),
                label: Text(_busy ? _busyLabel : 'Seal and send'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
