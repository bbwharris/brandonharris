---
categories:
- haxe
- flash
date: 2009-05-13T00:00:00Z
title: Haxe - An Interesting Path To Open Source Flash Programming
url: /2009/05/13/haxe-an-interesting-path-to-open-source-flash-programming/
---

I have my reservations about learning flash. It is proprietary, bloated, and doesn’t work very well on linux 64bit. However, there are a lot of rich web applications that need to be flash based. Youtube anyone? I landed on [haxe](http://haxe.org).

I was slightly turned off by the fact that haxe can compile to javascript, flash, or Neko (which I am not familiar with). However, what turned my on was that haxe compiled to swf is apparently faster than AS3 compiled swf’s. That argument is probably a good topic for another post, I will have to run some benchmarking.

The documentation on [haxe.org](http://haxe.org) is pretty good. [Here is a good tutorial](http://www.cactusflower.org/learning-flash-with-haxe#library) on getting started with flash and haxe.

Here is an example of drawing two circles in haxe:

```haxe
class Test {
  static function main() {
    var mc:flash.display.MovieClip = flash.Lib.current;
    //set the fill color
    mc.graphics.beginFill(0x000000);
    //draw a circle at x=50, y=50 with a radius of 25
    mc.graphics.drawCircle(50,50,25);
    //complete the fill routine
    mc.graphics.endFill();
    
    //set the fill color for the second circle
    mc.graphics.beginFill(0xefefef);
    //draw a circle at x=75,y=50 with a radius of 25
    mc.graphics.drawCircle(75,50,25);
    //complete the fill
    mc.graphics.endFill();
  }
}
```

The result is what you see below.

You can see that it is pretty easy to read and understand. If you follow the tutorial at [cactusflower.org](http://www.cactusflower.org/learning-flash-with-haxe#library) you will create something a little more interactive.

My impression is that if you need to develop a flash app and would like to use Open Source tools, haxe is definitely an option.
