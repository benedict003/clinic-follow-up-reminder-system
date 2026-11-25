// lib/screens/patients_screen.dart
//
// The register. A follow-up is only as good as the number you can reach, so the
// register is a first-class screen: who is being followed, and how to contact
// them. Registration lives here as well as in the scheduling sheet, because a
// clerk may register a patient before any follow-up is decided.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/clinic_api.dart';
import '../api/clinical_api.dart';
import '../models/clinical.dart';
import '../widgets/clinical.dart';
import '../widgets/ui.dart';
import 'new_follow_up_sheet.dart';

class PatientsScreen extends StatefulWidget {
  const PatientsScreen({super.key});

  @override
  State<PatientsScreen> createState() => _PatientsScreenState();
}

class _PatientsScreenState extends State<PatientsScreen> {
  final TextEditingController _search = TextEditingController();
  List<ClinicalPatient>? _rows;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final List<ClinicalPatient> rows =
      await ClinicalApi.instance.patients(q: _search.text);
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load the register: $e';
        _loading = false;
      });
    }
  }

  Future<void> _scheduleFor(ClinicalPatient p) async {
    final bool? created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: NewFollowUpSheet(patientId: p.id),
      ),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    // Tabs do not draw their own title bar: HomeShell owns the only one. A second
    // bar made this tab read "Patients" twice.
    return Scaffold(
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: TextField(
                    controller: _search,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _load(),
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: 'Search name, id or phone',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                        tooltip: 'Clear',
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () {
                          _search.clear();
                          _load();
                        },
                      ),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  tooltip: 'Reload',
                  onPressed: _load,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
          ),
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_error != null) {
      return ErrorView(error: _error!, onRetry: _load);
    }
    final List<ClinicalPatient> rows = _rows ?? const <ClinicalPatient>[];
    if (!_loading && rows.isEmpty) {
      return EmptyNote(
        icon: Icons.people_outline,
        title: 'No patient matches.',
        detail: 'Register a patient from the Follow-ups tab when you schedule '
            'their first follow-up.',
      );
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final ClinicalPatient p in rows)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor:
                  Theme.of(context).colorScheme.surfaceContainerHighest,
                  child: Text(p.initials,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ),
                title: Text(p.name),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('${p.id} · ${p.category}'),
                    Row(
                      children: <Widget>[
                        Icon(
                          p.contactNumber == null
                              ? Icons.phone_disabled
                              : Icons.call_outlined,
                          size: 12,
                          color: p.contactNumber == null
                              ? Theme.of(context).colorScheme.error
                              : Theme.of(context).colorScheme.outline,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          p.contactNumber ?? 'No number on file',
                          style: TextStyle(
                            fontSize: 12,
                            fontFamily: p.contactNumber == null ? null : 'monospace',
                            color: p.contactNumber == null
                                ? Theme.of(context).colorScheme.error
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                isThreeLine: true,
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: <Widget>[
                    Text('${p.openFollowUps} open',
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 2),
                    const Icon(Icons.chevron_right, size: 18),
                  ],
                ),
                onTap: () => _scheduleFor(p),
                onLongPress: () {
                  if (p.contactNumber == null) return;
                  Clipboard.setData(ClipboardData(text: p.contactNumber!));
                  ScaffoldMessenger.of(context)
                    ..hideCurrentSnackBar()
                    ..showSnackBar(const SnackBar(content: Text('Number copied')));
                },
              ),
            ),
        ],
      ),
    );
  }
}
