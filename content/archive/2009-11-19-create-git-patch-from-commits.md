---
categories:
- git
date: 2009-11-19T00:00:00Z
title: Create Git Patch From Commits
url: /2009/11/19/create-git-patch-from-commits/
---

This is another of those excruciatingly easy tasks that isn’t well documented.

```bash
git format-patch sha1..sha2
```

Where sha1 is the older commit and sha2 is the newer commit. This will create patches for each modified file between those commits.
