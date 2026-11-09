---
categories:
- karmic
- ubuntu
date: 2009-11-01T00:00:00Z
title: Dell Studio 15 "White Screen of Death" Karmic Koala Workaround
url: /2009/11/01/dell-studio-15-white-screen-of-death-karmic-koala-workaround/
---

It’s a horrible feeling to watch your system die after an upgrade. You may have experienced this problem before. Fear not, there is a workaround, and you will be back into your computer in no time. Just follow these directions, they may appear slightly more advanced than what you might be used to, but this can be fixed.

Add “nomodeset” to the boot options in grub. Use vim (or nano, or whatever you like to use) to edit the boot options. If you are booting from your hard drive on a recent upgrade, you can hit “Esc” at the grub boot screen and select the kernel after 2.6.31.

In my case it was 2.6.28-16. You will be booting into Karmic with an Intrepid Kernel, don’t be surprised if some stuff doesn’t work perfectly, you are just doing this to have a way to edit the grub configuration.

Once you get into your system, do the following:

```bash
sudo vim /boot/grub/menu.lst
```

Change:

```bash
title           Ubuntu 9.10, kernel 2.6.31-14-generic
uuid            76c6b53b-0181-4ebe-af5e-2abe3db988d7
kernel          /boot/vmlinuz-2.6.31-14-generic root=UUID=76c6b53b-0181-4ebe-af5e-2abe3db988d7 ro xforcevesa quiet splash
initrd          /boot/initrd.img-2.6.31-14-generic
quiet

title           Ubuntu 9.10, kernel 2.6.31-14-generic (recovery mode)
uuid            76c6b53b-0181-4ebe-af5e-2abe3db988d7
kernel          /boot/vmlinuz-2.6.31-14-generic root=UUID=76c6b53b-0181-4ebe-af5e-2abe3db988d7 ro xforcevesa  single
initrd          /boot/initrd.img-2.6.31-14-generic
```

To read like this:

```bash
title           Ubuntu 9.10, kernel 2.6.31-14-generic
uuid            76c6b53b-0181-4ebe-af5e-2abe3db988d7
kernel          /boot/vmlinuz-2.6.31-14-generic root=UUID=76c6b53b-0181-4ebe-af5e-2abe3db988d7 ro xforcevesa quiet splash nomodeset
initrd          /boot/initrd.img-2.6.31-14-generic
quiet

title           Ubuntu 9.10, kernel 2.6.31-14-generic (recovery mode)
uuid            76c6b53b-0181-4ebe-af5e-2abe3db988d7
kernel          /boot/vmlinuz-2.6.31-14-generic root=UUID=76c6b53b-0181-4ebe-af5e-2abe3db988d7 ro xforcevesa  single nomodeset
initrd          /boot/initrd.img-2.6.31-14-generic
```

Don’t just copy-paste from this post, simply add “nomodeset” to the end of the line that starts with the word “kernel”, and only do this for the 2.6.31-14 kernel.

Reboot, and watch as you boot into your new Karmic upgrade.

This bug is being worked on in [this ticket](https://bugs.launchpad.net/ubuntu/hardy/+source/xserver-xorg-video-intel/+bug/297245)

Keep in mind that any new kernel updates might need this same workaround if you experience the “White Screen of Death”.

Blame AUO for jacking up the EDID for the panel, blame Dell for picking cheap parts, blame yourself for buying cheap hardware, certainly don’t blame the hardworking developers who provide you a great OS, they are hard at work fixing these issues.
