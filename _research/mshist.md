---
title: Multi-scale Histogram based Wide Dynamic Range Tone Mapping
permalink: /research/mshist.html
---
***Abstract***

we present a novel tone mapping algorithm that can be used for displaying wide dynamic range (WDR) images on low dynamic range (LDR) devices. The proposed algorithm is mainly motivated by the logarithmic response and local adaptation features of the human visual system (HVS). HVS perceives luminance differently when under different adaptation levels, and therefore our algorithm uses functions built upon different scales to tone map pixels to different values. Functions of large scales are used to maintain image brightness consistency and functions of small scales are used to preserve local detail and contrast. An efficient method using local variance has been proposed to fuse the values of different scales and to remove artifacts. The algorithm utilizes integral images and integral histograms to reduce computation complexity and processing time. Experimental results show that the proposed algorithm can generate high brightness, good contrast and appealing images that surpass the performance of many state-of-the-art tone
mapping algorithms.

***Some Results***

| <img src="http://jieyang1987.github.io/files/AtriumMorning/AtriumMorning_Gu.jpg" height="200px" alt="图片说明" > |<img src="http://jieyang1987.github.io/files/AtriumMorning/AtriumMorning_durand.jpg" height="200px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/AtriumMorning/AtriumMorning_paris.jpg" height="200px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/AtriumMorning/AtriumMorning_mshist.png" height="200px" alt="图片说明" >|
|:----------:|:-------------:|:------:|:-----:|
| Gu *et al.* |  Durand *et al.* | Paris *etl al.* | The proposed |

| <img src="http://jieyang1987.github.io/files/garage/gu.jpg" height="200px" alt="图片说明" > |<img src="http://jieyang1987.github.io/files/garage/durand.jpg" height="200px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/garage/paris.jpg" height="200px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/garage/ours.bmp" height="200px" alt="图片说明" >|
|:----------:|:-------------:|:------:|:-----:|
| Gu *et al.* |  Durand *et al.* | Paris *etl al.* | The proposed |
