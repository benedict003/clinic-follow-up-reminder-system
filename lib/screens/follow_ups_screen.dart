// lib/screens/follow_ups_screen.dart
//
// The board a clinic actually works from: what is overdue, what is due today,
// what is coming, and everything that has been closed. Search covers name, id
// and reason, so a nurse can find a patient by whichever she has in front of her.
import 'package:flutter/material.dart';

import '../api/clinical_api.dart';
import '../app_routes.dart';
import '../models/clinical.dart';
import '../widgets/clinical.dart';
import '../widgets/ui.dart';
import 'new_follow_up_sheet.dart';

class FollowUpsScreen extends StatefulWidget {
  const FollowUpsScreen({super.key, this.initialScope});

  /// Set by the home screen's worklist tiles, which jump straight to a filter.
  final String? initialScope;

  @override
  State<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

class _FollowUpsScreenState extends State<FollowUpsScreen> {
  static const List<({String key, String label})> _scopes = <({String key, String label})>[
    (key: 'open', label: 'All open'),
    (key: 'overdue', label: 'Overdue'),
    (key: 'today', label: 'Today'),
    (key: 'upcoming', label: 'Upcoming'),
    (key: 'closed', label: 'Closed'),
  ];

  final TextEditingController _search = TextEditingController();
  String _scope = 'open';
  Future<FollowUpBoard>? _future;
  String _appliedInitial = '';

  @override
  void initState() {
    super.initState();
    _apply(widget.initialScope);
    _load();
  }

  @override
  void didUpdateWidget(FollowUpsScreen old) {
    super.didUpdateWidget(old);
    if (widget.initialScope != old.initialScope) {
      _apply(widget.initialScope);
      _load();
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _apply(String? scope) {
    if (scope == null || scope == _appliedInitial) return;
    _appliedInitial = scope;
    _scope = scope;
  }

  void _load() {
    final Future<FollowUpBoard> future =
    guardFuture(ClinicalApi.instance.board(scope: _scope, q: _search.text));
    setState(() {
      _future = future;
    });
    // Counts feed the chips, which sit outside the FutureBuilder. Storing them
    // here keeps the chip numbers honest without a second request.
    future.then((FollowUpBoard board) {
      if (mounted) setState(() => _counts = board.counts);
    }).catchError((Object _) {});
  }

  Future<void> _refresh() async {
    _load();
    await _future;
  }

  Future<void> _openNewFollowUp() async {
    final bool? created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: const NewFollowUpSheet(),
      ),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    // No AppBar here: this screen is a tab inside HomeShell, which owns the one
    // title bar. A second bar made the tab render "Follow-ups" twice.
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openNewFollowUp,
        icon: const Icon(Icons.add),
        label: const Text('New follow-up'),
      ),
      body: Column(
        children: <Widget>[
          _searchBar(),
          _scopeChips(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: FutureBuilder<FollowUpBoard>(
                future: _future,
                builder: (BuildContext context, AsyncSnapshot<FollowUpBoard> snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const LoadingView();
                  }
                  if (snap.hasError) {
                    return ErrorView(error: snap.error!, onRetry: _load);
                  }
                  final FollowUpBoard board = snap.data!;
                  if (board.followUps.isEmpty) {
                    return EmptyNote(
                      icon: Icons.event_available,
                      title: _search.text.trim().isEmpty
                          ? 'Nothing in this list.'
                          : 'No match for "${_search.text.trim()}".',
                      detail: _scope == 'overdue'
                          ? 'No follow-up is late. That is the good outcome.'
                          : null,
                    );
                  }
                  return SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 96),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                          child: Text(
                            '${board.followUps.length} '
                                '${board.followUps.length == 1 ? 'record' : 'records'}'
                                '${_search.text.trim().isEmpty ? '' : ' matching'}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                        for (final ClinicalFollowUp f in board.followUps)
                          FollowUpCard(
                            followUp: f,
                            onTap: () async {
                              await Navigator.of(context)
                                  .pushNamed(AppRoutes.followUp, arguments: f.id);
                              if (mounted) _load();
                            },
                          ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _searchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      child: Row(
        children: <Widget>[
          Expanded(
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                isDense: true,
                hintText: 'Search name, id or reason',
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
              onChanged: (_) => setState(() {}),
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
    );
  }

  Widget _scopeChips() {
    return SizedBox(
      height: 46,
      // A horizontal SingleChildScrollView, not a ListView: the chips do not
      // need to be built lazily, and this cannot hit the sliver hit-test path
      // that froze the web build.
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          children: <Widget>[
            for (final ({String key, String label}) s in _scopes)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(_chipLabel(s)),
                  selected: _scope == s.key,
                  onSelected: (_) {
                    setState(() => _scope = s.key);
                    _load();
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  BoardCounts? _counts;

  /// The chip carries its own count, so the size of each queue is visible
  /// without opening it.
  String _chipLabel(({String key, String label}) s) {
    final BoardCounts? c = _counts;
    if (c == null) return s.label;
    final int n = switch (s.key) {
      'overdue' => c.overdue,
      'today' => c.dueToday,
      'upcoming' => c.upcoming,
      'closed' => c.closed,
      _ => c.open,
    };
    return n > 0 ? '${s.label} ($n)' : s.label;
  }
}
