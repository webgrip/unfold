# Start from work your team already prioritized

The **Tasks** view lists Forgejo, GitHub, GitLab, ClickUp and Vikunja sources that an administrator connected on the server. No tracker token is entered in VS Code.

1. Expand a source and select a task, or run **Unfold: Browse Tasks** to filter, page and open a task by ID.
2. The task opens in its own tab: the description rendered as text, labels and assignees, headed by what Ploeg is doing with it, why, and what happens next.
3. To hand it to Ploeg, choose a team and select **Hand to _team_**. Unfold assigns that team's tracker user and comments that you handed it over; Ploeg queues it, works on a branch and opens a pull request for your review. You can take it back until Ploeg starts.
4. To steer the work yourself instead, choose **Start a supervised session** where the board allows it, then pick a crew, runtime and spending authorization. The session is created queued and pins the exact task revision.

Only **Hand to Ploeg** and **Take back** change the task in its tracker. Opening, reading and starting a session never assign, close or edit it.
