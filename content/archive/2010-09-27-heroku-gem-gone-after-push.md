---
categories:
- heroku
date: 2010-09-27T00:00:00Z
title: Heroku Gem Gone After Push
url: /2010/09/27/heroku-gem-gone-after-push/
---

I recently deployed to heroku and was greeted with the dreaded “App Crashed” dialogue. In this particular case it was for a higher traffic production site, so I was frantic to fix it.  
A quick

```bash
heroku logs
```

showed that the memcache gem was missing. I scratched my head a little bit and did a quick git log on the .gem file. It hadn’t changed in months. Time was ticking, so I looked up the current version that I needed for the environment and I added it in. Another git push and I waited.  
All the gems were pulled in and the instance started successfully. In my haste to move on to the next task, I didn’t follow up too much and just assumed that this was a fluke.

It happened again, this time to a much less important application. Only it was a different gem. I took the time a looked through the heroku gem command list look for something like heroku rake gems:refresh or similar. Nothing! This seems like a very logical task. The only way I can think to force a gem refresh is to edit the .gems file and perform a push.

I this case, that is what I did again. I am not currently running on the bamboo stack, and this looks like it is a new phenomenon. Has anyone else experience this oddity? If I find a fix, I will post back here. Maybe I need to get moving on upgrading to the bamboo stack…

To be continued.

**Update 10/03/2010**

I spoke with a local heroku developer and the issue that I experienced along with several others was caused by an error in the slug compiler. A fix has been released and this issue should be resolved. If you do experience it, simply touching the .gems file and committing will result in a slug recompile.
