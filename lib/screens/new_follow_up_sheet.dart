// lib/screens/new_follow_up_sheet.dart
//
// Scheduling a follow-up needs three things at the desk: who, when, and why.
// The patient picker searches by name, id or phone, and a patient who is not in
// the register yet can be added without leaving the form — otherwise a nurse
// has to abandon the follow-up to go and register someone.
import 'package:flutter/material.dart';

import '../api/clinic_api.dart';
import '../api/clinical_api.dart';
import '../api/reminder_api.dart';
import '../models/clinical.dart';
import '../widgets/clinical.dart';

class NewFollowUpSheet extends StatefulWidget {
  const NewFollowUpSheet({super.key, this.patientId});

  /// Pre-selects a patient when the sheet is opened from a patient's page.
  final String? patientId;

  @override
  State<NewFollowUpSheet> createState() => _NewFollowUpSheetState();
}

class _NewFollowUpSheetState extends State<NewFollowUpSheet> {
  final TextEditingController _patientQuery = TextEditingController();
  final TextEditingController _reason = TextEditingController();
  final TextEditingController _newId = TextEditingController();
  final TextEditingController _newName = TextEditingController();
  final TextEditingController _newPhone = TextEditingController();

  ClinicalPatient? _selected;
  DateTime _due = DateTime.now();
  String _category = 'student';
  bool _addingPatient = false;
  bool _busy = false;
  String? _error;
  List<ClinicalPatient> _matches = const <ClinicalPatient>[];

  @override
  void initState() {
    super.initState();
    _search();
    if (widget.patientId != null) {
      ClinicalApi.instance.patients(q: widget.patientId!).then((List<ClinicalPatient> rows) {
        if (!mounted) return;
        final ClinicalPatient? hit = rows
            .where((ClinicalPatient p) => p.id == widget.patientId)
            .cast<ClinicalPatient?>()
            .firstWhere((ClinicalPatient? p) => p != null, orElse: () => null);
        if (hit != null) setState(() => _selected = hit);
      }).catchError((Object _) {});
    }
  }

  @override
  void dispose() {
    _patientQuery.dispose();
    _reason.dispose();
    _newId.dispose();
    _newName.dispose();
    _newPhone.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    try {
      final List<ClinicalPatient> rows =
      await ClinicalApi.instance.patients(q: _patientQuery.text);
      if (!mounted) return;
      setState(() {
        _matches = rows;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    }
  }

  String get _dueIso =>
      '${_due.year.toString().padLeft(4, '0')}-'
          '${_due.month.toString().padLeft(2, '0')}-'
          '${_due.day.toString().padLeft(2, '0')}';

  Future<void> _pickDate() async {
    final DateTime today = DateTime.now();
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _due.isBefore(today) ? today : _due,
      firstDate: DateTime(today.year - 1),
      lastDate: DateTime(today.year + 3),
      helpText: 'When should this patient come back?',
    );
    if (picked != null && mounted) setState(() => _due = picked);
  }

  Future<void> _registerPatient() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ClinicalPatient p = await ClinicalApi.instance.createPatient(
        id: _newId.text.trim(),
        name: _newName.text.trim(),
        category: _category,
        contactNumber: _newPhone.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _selected = p;
        _addingPatient = false;
        _busy = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    }
  }

  Future<void> _submit() async {
    final ClinicalPatient? patient = _selected;
    final String reason = _reason.text.trim();
    if (patient == null) {
      setState(() => _error = 'Choose the patient this follow-up is for.');
      return;
    }
    if (reason.isEmpty) {
      setState(() => _error = 'Record why the patient is coming back.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ReminderApi.instance.createFollowUp(
        patientId: patient.id,
        dueDate: _dueIso,
        reason: reason,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData t = Theme.of(context);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Row(
                children: <Widget>[
                  const Icon(Icons.add_task, size: 20),
                  const SizedBox(width: 8),
                  Text('New follow-up', style: t.textTheme.titleMedium),
                  const Spacer(),
                  Text(formatShortDate(_dueIso), style: t.textTheme.bodySmall),
                ],
              ),
              const SizedBox(height: 14),

              if (_error != null) ...<Widget>[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: t.colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Icon(Icons.error_outline, size: 16),
                      const SizedBox(width: 8),
                      Expanded(child: Text(_error!, style: const TextStyle(fontSize: 12))),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              _sectionLabel('Patient'),
              const SizedBox(height: 6),
              if (_selected != null)
                Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: CircleAvatar(
                      radius: 16,
                      backgroundColor: t.colorScheme.primaryContainer,
                      child: Text(_selected!.initials, style: const TextStyle(fontSize: 12)),
                    ),
                    title: Text(_selected!.name),
                    subtitle: Text('${_selected!.id} · ${_selected!.category}'
                        '${_selected!.contactNumber == null ? '' : ' · ${_selected!.contactNumber}'}'),
                    trailing: IconButton(
                      tooltip: 'Choose someone else',
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () => setState(() => _selected = null),
                    ),
                  ),
                )
              else ...<Widget>[
                TextField(
                  controller: _patientQuery,
                  onChanged: (_) => _search(),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: 'Search name, id or phone',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 6),
                if (_matches.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text('No patient matches. Register one below.',
                        style: t.textTheme.bodySmall),
                  )
                else
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 190),
                    child: SingleChildScrollView(
                      child: Column(
                        children: <Widget>[
                          for (final ClinicalPatient p in _matches)
                            ListTile(
                              dense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                              leading: CircleAvatar(
                                radius: 14,
                                backgroundColor: t.colorScheme.surfaceContainerHighest,
                                child: Text(p.initials,
                                    style: const TextStyle(fontSize: 10)),
                              ),
                              title: Text(p.name),
                              subtitle: Text('${p.id} · ${p.openFollowUps} open'),
                              trailing: const Icon(Icons.chevron_right, size: 18),
                              onTap: () => setState(() => _selected = p),
                            ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => setState(() => _addingPatient = !_addingPatient),
                    icon: Icon(_addingPatient ? Icons.expand_less : Icons.person_add_alt,
                        size: 18),
                    label: Text(_addingPatient ? 'Hide new patient' : 'Register a new patient'),
                  ),
                ),
                if (_addingPatient) ...<Widget>[
                  TextField(
                    controller: _newId,
                    decoration: const InputDecoration(
                      isDense: true,
                      labelText: 'Patient id (e.g. 2026-00042 or E-0002)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _newName,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      isDense: true,
                      labelText: 'Full name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _newPhone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      isDense: true,
                      labelText: 'Contact number',
                      helperText: 'Used by the clinic only; never sent to the partner.',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<String>(
                    segments: const <ButtonSegment<String>>[
                      ButtonSegment<String>(value: 'student', label: Text('Student')),
                      ButtonSegment<String>(value: 'employee', label: Text('Employee')),
                    ],
                    selected: <String>{_category},
                    onSelectionChanged: (Set<String> s) =>
                        setState(() => _category = s.first),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : _registerPatient,
                      icon: const Icon(Icons.person_add_alt_1, size: 18),
                      label: const Text('Save patient'),
                    ),
                  ),
                ],
              ],

              const SizedBox(height: 16),
              _sectionLabel('Due date'),
              const SizedBox(height: 6),
              Card(
                margin: EdgeInsets.zero,
                child: ListTile(
                  leading: const Icon(Icons.event),
                  title: Text(formatDueDate(_dueIso)),
                  subtitle: Text('Tap to choose another day'),
                  trailing: const Icon(Icons.edit_calendar, size: 18),
                  onTap: _pickDate,
                ),
              ),

              const SizedBox(height: 16),
              _sectionLabel('Reason for follow-up'),
              const SizedBox(height: 6),
              TextField(
                controller: _reason,
                minLines: 2,
                maxLines: 3,
                maxLength: 300,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: 'e.g. Blood pressure recheck after medication change',
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _busy ? null : _submit,
                icon: _busy
                    ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.check),
                label: const Text('Schedule follow-up'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
    text.toUpperCase(),
    style: Theme.of(context).textTheme.labelSmall?.copyWith(
      letterSpacing: 0.6,
      color: Theme.of(context).colorScheme.outline,
    ),
  );
}
