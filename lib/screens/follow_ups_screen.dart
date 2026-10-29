// lib/screens/follow_ups_screen.dart
import 'package:flutter/material.dart';

import '../api/reminder_api.dart';
import '../widgets/ui.dart';

class FollowUpsScreen extends StatefulWidget {
  const FollowUpsScreen({super.key});
  @override
  State<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

class _FollowUpsScreenState extends State<FollowUpsScreen> {
  String _status = '';
  late Future<List<dynamic>> _future = ReminderApi.instance.followUps();

  void _load(String s) => setState(() {
    _status = s;
    _future = ReminderApi.instance.followUps(status: s);
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              for (final s in ['', 'scheduled', 'reminded', 'closed'])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(s.isEmpty
                        ? 'All'
                        : s[0].toUpperCase() + s.substring(1)),
                    selected: _status == s,
                    onSelected: (_) => _load(s),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => _load(_status),
            child: FutureBuilder<List<dynamic>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) return const LoadingView();
                if (snap.hasError) {
                  return ErrorView(error: snap.error!, onRetry: () => _load(_status));
                }
                final rows = snap.data ?? const [];
                if (rows.isEmpty) {
                  return const EmptyView(
                    message: 'No follow-ups in this filter.',
                    icon: Icons.event_repeat,
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.only(bottom: 16),
                  itemCount: rows.length,
                  itemBuilder: (context, i) {
                    final f = (rows[i] as Map).cast<String, dynamic>();
                    return ListTile(
                      leading: StatusChip(status: '${f['status']}'),
                      title: Text('${f['patientName']} · ${f['patientId']}'),
                      subtitle: Text('${f['dueDate']} · ${f['reason']} · '
                          'v${f['version']}'),
                      trailing: Text('#${f['id']}',
                          style: const TextStyle(fontSize: 12)),
                    );
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}