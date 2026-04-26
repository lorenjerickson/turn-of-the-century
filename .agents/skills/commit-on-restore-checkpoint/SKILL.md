---
name: commit-on-restore-checkpoint
description: This skill allows the agent to commit changes to a checkpoint when restoring it, ensuring thatthe checkpoint reflects the latest state of the project.
---

# Commit on Restore Checkpoint Skill

Incremental changes need to be tracked in source control, not just in the agent session. This skill requires the agent to create a git commit whenever a restore checkpoint is created or restored. This ensures that the checkpoint reflects the latest state of the project and allows for better tracking of changes over time. 

When a restore checkpoint is created, the agent will automatically stage all changes and create a commit with a message that summarizes the changes made, and indicating that a restore checkpoint has been created. When a restore checkpoint is restored, the agent will also create a commit with a message that summarizes the changes made and indicates that the checkpoint has been restored.

## Instructions for Use

1. Ensure that the project is initialized as a git repository and that the agent has access to commit changes.
2. When creating a restore checkpoint, the agent will automatically stage all changes and create a commit with a message that summarizes the changes made and indicates that a restore checkpoint has been created.
3. When restoring a checkpoint, the agent will also create a commit with a message that summarizes the changes made and indicates that the checkpoint has been restored.
4. Review the commit history to track changes made to the project over time, especially in relation to restore checkpoints.

## Benefits

- Improved tracking of changes: By committing changes to a checkpoint, you can easily track the history of changes made to the project, especially in relation to restore checkpoints.
- Better collaboration: Committing changes to a checkpoint allows other team members to see the changes made and understand the context of the checkpoint, facilitating better collaboration.
- Enhanced project management: By maintaining a clear commit history, you can better manage the project and identify any issues or changes that may arise in relation to restore checkpoints.
- Increased accountability: Committing changes to a checkpoint ensures that all changes are documented and can be traced back to the agent responsible for them, increasing accountability within the project.
- Improved debugging: If issues arise after restoring a checkpoint, having a commit history allows you to easily identify what changes were made and when, making it easier to debug and resolve any issues that may arise.