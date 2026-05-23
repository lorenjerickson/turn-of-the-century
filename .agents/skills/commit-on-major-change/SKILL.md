---
name: commit-on-major-change
description: This skill instructs the agent to automatically stage and commit completed work, then ask before pushing; if approved, it updates the semantic version in system.json, commits that bump, and pushes the current branch to origin.
---

# Commit on Major Change Skill

Use this skill when a user asks for a task that results in one or more meaningful repository changes. The agent should keep the repository history aligned with completed work instead of leaving the workspace dirty after the task is done.

## Workflow

1. After completing the user-requested task, stage the relevant changes.
2. Create a git commit with a meaningful message that summarizes the completed changes.
3. Ask the user whether the changes should be pushed immediately.
4. If the user says no, leave the commits in the local branch so additional work can accumulate for a later push.
5. If the user says yes, ask whether the release should be a major, minor, or patch update.
6. Default to patch if the user does not specify a version bump type.
7. Update the semantic version in system.json accordingly.
8. Commit the system.json version bump as a separate commit before pushing.
9. Push the committed changes to origin on the current branch.

## Rules

- The first commit after a completed task should summarize the task changes, not the push process.
- Version bumps are only required when the user approves an immediate push.
- The version bump commit must happen after the task commit and before the push.
- Do not push without asking the user first.
- Pushes always target the current branch on origin; do not prompt for a different branch.
- Do not assume a major or minor bump; ask unless the user already chose one.
- Keep the commit messages clear, concise, and descriptive of the actual changes.

## Expected Behavior

This skill is meant to keep work tidy during rapid iteration while still supporting release-ready pushes when the user wants them. It balances local accumulation of changes with a versioned, committed release step when the user decides to publish to origin.
