---
categories:
- bliptv
- rails
date: 2009-10-14T00:00:00Z
title: BlipTV API In Ruby
url: /2009/10/14/bliptv-api-in-ruby/
---

I recently needed to do some work for a client to integrate their site with blip. The [blip tv wiki](http://wiki.blip.tv) points ruby developers to a decent project.

However, my needs were a lot more intricate than what the current gem covers. I forked the project and added in the functionality that I needed (as is the case for most open source needs). Along the way, I found out that bliptv has a json api. I couldn’t resist and converted the bliptv gem to leverage the json api. Probably a faux pas, but it is faster than rss/xml parsing.

What I really needed was a way to pull private video embed codes, from an account that we had access to. The only way to do this was to login, save the cookie and then query the api. Yes, it feels hacky, but it serves the purpose.

Accomplishing this code in your project is as simple as the following code:

```ruby
  client = BlipTV::Base.new({
    :username => ENV.fetch("BLIPTV_USERNAME"),
    :password => ENV.fetch("BLIPTV_PASSWORD"),
  })
  videos = client.all_videos_from_login
```

Where videos is an array of BlipTV::Video object.

See [my fork on github](http://github.com/bbwharris/bliptv) if you are interested.
