---
categories:
- git
date: 2009-04-14T00:00:00Z
title: Git a remote branch
url: /2009/04/14/git-a-remote-branch/
---

Git has it’s own work flow apart from other change management software. Branching is particularly easy, but slightly different than what one is used to. Typically, we create local branches in git to test out new ideas. Occasionally, these new ideas are good enough to share with other developers and suddenly we want a remote version of that remote branch.

We have already done this:

```bash
git checkout -b my_new_awesome_branch
```

We want to do this:

```bash
git push origin my_new_awesome_branch
```

That works, but then you don’t properly track the new branch. To include tracking as well, you would instead do:

```bash
git push origin origin:refs/heads/my_new_awesome_branch
```

That will create the remote branch. Cool, now lets push our changes to it…

```bash
git push origin origin/my_new_awesome_branch
```

In getting to this point you might run into snags, make sure you have committed everything and resolved all conflicts.

Now, you want to remove that remote branch?

```bash
git branch -r -d origin/my_new_awesome_branch
```

Done? Not quite…

```bash
git push origin my_new_awesome_branch
```

That clears it from the remote. Git is still pretty cool.
