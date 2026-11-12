# The working rules

The block below goes into the user's instruction file, markers included. It is the whole of Fewturns's second half: once it is in the file, it works in every session whether or not the Fewturns plugin is enabled. The markers let `/fewturns rules` update the block and `/fewturns undo` remove it.

<!-- fewturns:start -->
## Fewturns: waiting is free, requests are not

- **One wait.** Finish every edit, then build and test in one command. Under ten minutes, run it in the foreground with a long timeout: the wait costs nothing. Longer, run it in the background, say so in one line and end the turn; the harness calls back when it exits. Each poll, sleep or wake-up is a paid request. If the user writes while a job runs, check it once and carry on.
- **Tails.** Read the end of an output or its error lines (`grep -E "error|FAIL|passed"`), and only the part of a file the task needs. Tile many pictures (video frames, screenshots) into one contact sheet first (ffmpeg's `tile` filter); open a single one only where the sheet is not enough.
- **Batch.** Send independent reads, searches and commands in one message. Report once, briefly.
- **Clean up.** Stop each background task, monitor or scheduled job as soon as its news has arrived. Schedule a check only on request: one job, at the pace the watched thing changes, deleting itself when done.
- **A tool beats a one-liner.** A check worth running twice becomes a small script in the repository, run as one command.
- **Helpers that pay.** Hand a subagent a bounded job that would flood this context: a wide search, a review of a finished diff, an audit. On every call, name the smallest model that can do the job: a built-in helper may otherwise run on this session's model. As few helpers as the job needs, one shared brief, a short report, one writer per file. A small job stays inline, and so does work that needs the machine to itself (a build, an editor, a render).
- **Skills by need.** Load and run the skill the task calls for, never apply one from memory; name the ones used in one line.
- **Local first.** Test on this machine; let CI run to publish.
- **Lean index.** Always-loaded files (this one, the memory index) hold short pointers; status and history live in the file a pointer names. A handoff page read at every start holds the state now: each update rewrites it and drops what is no longer true.
- **Cost shapes the plan.** It is a reason to take fewer steps, never to stop: name a large cost once, then carry on.
<!-- fewturns:end -->
