---
date: 2016-02-21T00:00:00Z
title: Automating Hugo Builds to an S3 Hosted Bucket
description: "My experience migrating from Jekyll to Hugo and automating deployment of my blog on S3 through Wercker"
url: /2016/02/21/automating-hugo-builds-to-an-s3-hosted-bucket
---

I recently migrated this site to use [Hugo](https://gohugo.io) instead of Jekyll. I was considering Middleman or simply updating the base version of Jekyll. However, there are a few reasons why I chose Hugo:

1. I wanted to evaluate Hugo
2. I want more exposure to the Go language
3. This is where I can experiment
4. It's crazy fast

I have previously built dozens of tiny sites using Middleman, so it was the first thing I reached for in my toolbox. However, I wanted something new. I took a quick look at Hugo. It is very promising and is just as functional as Middleman. My biggest worry was the time involvement in migrating from Jekyll to Hugo. While perusing the documentation I found this command:

```bash
      hugo import jekyll old_site new_site_in_hugo
```

I was highly skeptical that it could be this simple. I took a closer look at my shabby blog, and decided that I didn't have enough content to really put strain on this function. So I gave it a whirl.

It was remarkably that simple to migrate over to Hugo. The biggest challenge that I had afterwards was to replace all the Pygments based code markup with [Highlight.js](https://highlightjs.org/).

I accomplished this through a few calls to sed:

```bash
      sed -i '' -e 's/{{</* highlight ruby */>}}/<pre><code class="language-ruby">/g' content/post/*.html
      sed -i '' -e 's/{{</* highlight console */>}}/<pre><code class="language-bash">/g' content/post/*.html
```

To cover the closing tags:

```bash
      sed -i '' -e 's#{{</* / highlight */>}}#</code></pre>#g' content/post/*.html
```

I was in a little shock, something that I had set out to do in a few hours was completed in just under 15 minutes.
  
*Note that the above sed calls are specific to OSX, and not the GNU variant of sed. RTFM if you are doing something similar on your platform.*

Now that I was already *done* with the translation from Jekyll, I needed a strategy for deployment. Previously, I had a script that would build my site in Jekyll and then synchronize the build onto S3. Honestly, it was probably good enough, but I needed a challenge. I thought about how nice it would be to simply push my changes to my github repo, and have everything taken care of for me. Today, this kind of automation is commonplace.

I found [Wercker](http://wercker.com), again mentioned in the Hugo documentation. What Wercker attempts to solve is a build and deploy process through containerization. This is another technology that I am in love with right now, so I rolled up my sleeves and dove in.

## Automating Deployment with Wercker

Wercker wants you to use your Github or Bitbucket login. This makes sense, because this is where most of us keep our code. I currently do not have a need to publish private code to a wercker application. If you do, I haven't looked into possible options.

I followed [the directions](https://gohugo.io/tutorials/automated-deployments/) published in the Hugo documentation about how to publish your Hugo site on Github pages. I don't want to use Github pages, I want to continue to use my S3 bucket. The steps are almost identical in getting there, except for the final step: where you want your build to live.

You are directed to [this page](http://devcenter.wercker.com/docs/deploy/s3.html) in the Wercker documentation, which gets you pretty close to an automated Hugo / Github / S3 system.
  
I ran into a few snags in getting this all put together.

- I could not use my theme as a submodule in my site
- I spent way too much time trying to hide my AWS secrets
- The source\_dir is named "public/" in Hugo (of course it is!)

Some of this may be obvious at some point, but was not when I was working through this. So I ended up with a wercker.yml file that looks like this:

```ruby
    box: debian
    build:
      steps:
         - arjen/hugo-build@1.8.1:
           theme: slender
           config: "config.toml"
           version: "0.15"
           force_install: true
           disable_pygments: true
    deploy:
      steps:
        - wercker/s3sync@2.0.3:
          source-dir: "public"
          bucket-url: s3://brandon-harris.com
          key-id: $AWS_ACCESS_KEY_ID
          key-secret: $AWS_SECRET_ACCESS_KEY
```

Inside your Wercker Application, you can set environment variables.

![Wercker Settings](/images/wercker_screenshots/wercker_settings.png)

From here, you can access the interface to set your environment variables.

![Wercker Environment Variables](/images/wercker_screenshots/wercker_environment_variables.png)

Then you can set any key, value variables that you need access to in your build steps.

![Wercker Environment Variables Editing](/images/wercker_screenshots/wercker_env_vars_edit.png)

After some trial and error, it's all working! All I have to do is commit my changes and:

```bash
      git push origin master
```

Github receives my update, wercker detects the change, runs the build step inside a container, and finally runs the deploy step to synchronize changes to my S3 bucket. I even get an interface for all of this inside of Wercker.

You can see this entire blog content [on github](https://github.com/bbwharris/brandonharris), and you can view [the wercker application that is used to deploy it](https://app.wercker.com/#applications/56bfa083a21e380e1e02bd2e).

For me, my goal was accomplished and from this experience I can see Hugo, Wercker, and containers being placed into my toolbox. Even simple static sites, can be made interesting again with new technology.
