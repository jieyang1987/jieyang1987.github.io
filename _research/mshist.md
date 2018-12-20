---
title: Multi-scale Histogram based Wide Dynamic Range Tone Mapping
permalink: /research/mshist.html
---
***Abstract***

we present a novel tone mapping algorithm that can be used for displaying wide dynamic range (WDR) images on low dynamic range (LDR) devices. The proposed algorithm is mainly motivated by the logarithmic response and local adaptation features of the human visual system (HVS). HVS perceives luminance differently when under different adaptation levels, and therefore our algorithm uses functions built upon different scales to tone map pixels to different values. Functions of large scales are used to maintain image brightness consistency and functions of small scales are used to preserve local detail and contrast. An efficient method using local variance has been proposed to fuse the values of different scales and to remove artifacts. The algorithm utilizes integral images and integral histograms to reduce computation complexity and processing time. Experimental results show that the proposed algorithm can generate high brightness, good contrast and appealing images that surpass the performance of many state-of-the-art tone
mapping algorithms.

***Some Results***

|![曝光时间0.05](http://upload-images.jianshu.io/upload_images/1817489-c02669e20db450c9.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/200) |![曝光时间0.0125](http://upload-images.jianshu.io/upload_images/1817489-f1d2608c9bd21cf3.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/200)|![曝光时间0.003125](http://upload-images.jianshu.io/upload_images/1817489-6cb041161f01c7ac.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/200)|
