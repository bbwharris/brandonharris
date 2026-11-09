---
categories:
- heroku
- rails
date: 2010-11-06T00:00:00Z
title: Painless Upgrade to Bundler and Bamboo Stack
url: /2010/11/06/painless-upgrade-to-bundler-and-bamboo-stack/
---

I just upgraded this site to use bundler and the heroku Bamboo stack.

The steps were:

1. Remove the .gems file, and create a Gemfile.  
2. [Patch the Rails 2.3 installation for bundler](http://gembundler.com/rails23.html)  
3. Run heroku command:

```bash
heroku stack:migrate bamboo-ree-1.8.7
```

4.Run command:

```bash
bundle install
```

5. Commit all changes to git, and push to heroku.

I am really impressed with the ease at which this was done. Heroku continues to impress, and Bundler is the best thing to happen to Ruby since Rails.
