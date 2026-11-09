---
categories:
- flickr
- rails
date: 2009-10-20T00:00:00Z
title: Flickr Down, flickraw killed my app!
url: /2009/10/20/flickr-down-flickraw-killed-my-app/
---

10/29/2009 **Update**

Per Mael’s (Flickraw author) response, I was able to provide a better fix.

```ruby
FlickrawOptions = { :lazyload => true, :timeout => 2 }
require 'flickraw'
```

You can see more options in the [documentation](http://hanklords.github.com/flickraw/).

10/21/2009 **Original Post**  
As of the writing of this, Flickr has been down off and on for almost 2 hours.

I noticed that a handful of our websites weren’t working. I traced the problem back to flickraw, there was one line in the ApplicationController:

```ruby
require 'flickraw'
```

Not the best coding practice, but aside, it still needs to work without stalling on this line. In another project we had it enclosed in a begin end statement, but that didn’t do any good since no exceptions were being raised.

I temporarily patched it with the following code (don’t judge me).

```ruby
begin
  $STATUS = Timeout::timeout(2) {
    require 'flickraw'
  }
rescue
end
```

Then in the application controller where I make a call to the api, I use the $STATUS global. Gasp! A global variable in Ruby! Yes, get over it. It fixes an issue, and your clients will be happy to know that you no longer rely on Flickr for their site to work.
