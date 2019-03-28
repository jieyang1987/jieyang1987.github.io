---
title: Mantissa-exponent based Tone Mapping for Wide Dynamic Range Image Sensors
permalink: /research/hardware_tm.html
---

Published in *IEEE Transactions on circuit and System II: Express Briefs*

**Jie Yang**, Ulian Shahnivich, Orly Yadid-Pecht

[[Paper]](https://jieyang1987.github.io/files/TCASII2903101.pdf)

***Abstract***

The dynamic range of a scene is defined as the
ratio between the maximum and minimum luminance in it. Wide
dynamic range (WDR) means this ratio is so large that it exceeds
the dynamic range of a traditional image sensor. Nowadays, WDR
image sensors enable the capture of WDR scenes. However, the
captured WDR image requires an additional tone mapping step
to compress the high bit pixel of WDR image to low rate pixel
so that it can be displayed on the screen. The tone mapping
algorithm is mostly done in an image signal processor or with a
specific software application. This letter proposes a tone mapping
technique that is suitable for direct processing of the output of a
WDR image sensor bitstream. The algorithm acquires statistics
on the mantissa and exponent parts of the pixel value and then
generates a refined histogram for tone mapping. Experiments that
evaluate the image quality and hardware efficiency are carried
out. The results indicate that the proposed mantissa exponent
based algorithm provides visually pleasing results and preserves
details of the original WDR image better than other similar
algorithms. The hardware resources’ efficiency of the algorithm
makes the system on chip implementation possible.
