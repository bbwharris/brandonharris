---
categories:
- ubuntu
- dualhead2go
- triplehead2go
date: 2011-02-01T00:00:00Z
title: Matrox DualHead2Go, TripleHead2Go on Ubuntu, with ATI/AMD
url: /2011/02/01/matrox-dualhead2go-triplehead2go-on-ubuntu-with-ati-amd/
---

I recently purchased a [matrox dualhead2go digital edition](http://www.matrox.com/graphics/en/products/gxm/dh2go/) off of ebay on a whim. I did this because I wanted to make use of some extra monitors sitting around the office. I have also come to the realization that I have grown up as a developer and I have enough confidence to look anyone straight in the eye and say – “Yes, I need 3 monitors”.

My current setup is a Dell XPS 1640 running Ubuntu 10.04, with a Radeon 3670 graphics card. Yeah, enter the wonderful world of linux graphics drivers.

My first attempt was to simply, plug it in and see what would happen, resulted in a mild success. I was able to have my laptop lcd set at a resolution of 1920×1080 and the two 1680×1050 monitors would only go up to 2560×1024. It looked warped, but it gave me a taste of what was possible.

After much configuring with [xrandr —addmode, et. al ad nauseum](https://wiki.ubuntu.com/X/Config/Resolution), I came to the conclusion that the matrox just wouldn’t support a higher resolution than 2560×1024, even though the site claims that it will. Some searching prompted me to discover that you need to configure the device to support your desired resolutions using the matrox powerdesk tool. Windows and Mac users can rejoice, this exists for you both. Linux users, go get on that old Windows test box that you use for IE testing and configure this mutha.

Armed with the following resolutions 3360×1050, 3840×1080, I set to work on my dream display.

I hit another snag. I could crank the resolution on my laptop, or the two 22" monitors, but setting both to 11 caused really odd horizontal sync issues on my laptop. The text would be fuzzy and move from side to side. Clearly this wasn’t going to work using just Xrandr, and the Gnome Display tool.

This brings up another one of my errors. DO NOT USE THE GNOME DISPLAY TOOL after using the AMD/ATI Catalyst Control panel. The Gnome tool will nuke your xorg.conf file, and leave you scratching your head. Once you go FGLRX, forget that the Gnome display tool even exists, and trust yourself to learn the AMD/ATI Catalyst Control Panel as well as the aticonfig command line tool. If you are a complete badass and can handcraft your own xorg.conf file and modelines (why are you reading this?) skip ahead to the modeline cheats below.

I had clearly stepped into a limitation of the linux fglrx display driver, or so I thought. At one point, I had inadvertently nuked my xorg.conf file, so fglrx was no longer being loaded. (See cautionary statement above) I went through the relatively simple process of [removing all traces of fglrx from my system](https://wiki.ubuntu.com/X/Troubleshooting/FglrxInteferesWithRadeonDriver). I reinstalled the proprietary drivers (because I also require dropshadows, and transparency, that’s how I roll) and set back to work.

Now the magic steps to make your mutliple display work:

1 Make sure you have the necessary modes available.  
2 Add the modelines that you require to the display that you want them added to.  
3 Set your resolution in the ATI/AMD Catalyst Control Panel

To see 1:

```` ```
xrandr
``` ````

Will display all the modes available for you devices.

I am going to cheat and give you the “magic” modelines needed by the Matrox DualHead2Go, TripleHead2Go:

```` ```
DualHead:
2x 1680x1050:  ModeLine "3360x1050" 238.00 3360 3424 3488 3680 1050 1053 1061 1080 +HSync +VSync
2x 1600x1200:  ModeLine "3200x1200" 281.40 3200 3264 3456 3752 1200 1201 1206 1250 +HSync +VSync
2x 1920x1080:  ModeLine "3840x1080" 277.00 3840 3904 3968 4160 1080 1083 1092 1111 +HSync +VSync
2x 1920x1200:  ModeLine "3840x1200" 308.00 3840 3904 3968 4160 1200 1203 1213 1235 +HSync +VSync

TripleHead:
3x 1280x1024:  ModeLine "3840x1024" 254.31 3840 3856 3872 3976 1024 1025 1032 1066 +HSync +VSync
3x 1360x768:   ModeLine "4080x768"  200.38 4080 4104 4136 4200  768  771  779  795 +HSync +VSync
3x 1440x900:   ModeLine "4320x900"  320.10 4320 4400 4688 5712  900  903  915  934 +HSync +VSync
3x 1680x1050:  ModeLine "5040x1050" 326.66 5040 5104 5168 5376 1050 1053 1057 1066 +HSync +VSync
``` ````

To add one of these to your display:

```` ```
xrandr --newmode 
xrandr --addmode DEVICE "AAAAxBBBB"
``` ````

Where DEVICE is the device name for your display, probably CRT1, DFP1, LVDS, etc. and the “AAAAxBBBB” is the name of the modeline that you copied from above. So in my case:

```` ```
xrandr --newmode "3360x1050" 238.00 3360 3424 3488 3680 1050 1053 1061 1080 +HSync +VSync
xrandr --addmode CRT1 "3360x1050"
``` ````

Then I popped open the AMD/ATI Catalyst Control Panel – Voila! that resolution showed up. I set all my monitors to their desired resolution and it worked.

To make you changes permanent add the xrandr commands to you .xprofile. I move around between monitors at home and at work, so I don’t make this too automatic. If you made it this far, you can probably google your way into a more automated setup. Will upload a pic tomorrow of the working setup.
