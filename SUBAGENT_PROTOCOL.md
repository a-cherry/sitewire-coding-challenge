# Subagent protocol

How the implementing agent runs the `reviewer` subagent before each plan step.
CLAUDE.md "Review protocol" says when the review happens and what it reports;
`.claude/agents/reviewer.md` holds the reviewer's instructions. This file says
how to launch it.

## Running the reviewer

1. Run `git status --porcelain -uall` and keep the output.
2. Launch it with the Agent tool, `subagent_type: "reviewer"`. Tell it which
   PLAN.md step was just completed and which files that step left
   uncommitted.
3. If the `reviewer` type is not available in the session, launch a
   `general-purpose` agent instead. Its prompt is everything in
   `.claude/agents/reviewer.md` after the frontmatter, word for word, plus:
   the tools it may use (Read, Grep, Glob, and Bash for checks and read-only
   commands only), the step just completed, and that its final message will
   be relayed to Drew verbatim.
4. Wait for its report before writing any file for the next step, so it
   reviews the previous step as it stands.
5. Run `git status --porcelain -uall` again and confirm it matches the output
   kept before the launch.
6. In the step report, say which way it ran and paste its report verbatim,
   unfixed.
