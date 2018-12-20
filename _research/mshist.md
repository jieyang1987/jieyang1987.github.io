---
title: Multi-scale Histogram based Wide Dynamic Range Tone Mapping
permalink: /research/mshist.html
---
***Abstract***

we present a novel tone mapping algorithm that can be used for displaying wide dynamic range (WDR) images on low dynamic range (LDR) devices. The proposed algorithm is mainly motivated by the logarithmic response and local adaptation features of the human visual system (HVS). HVS perceives luminance differently when under different adaptation levels, and therefore our algorithm uses functions built upon different scales to tone map pixels to different values. Functions of large scales are used to maintain image brightness consistency and functions of small scales are used to preserve local detail and contrast. An efficient method using local variance has been proposed to fuse the values of different scales and to remove artifacts. The algorithm utilizes integral images and integral histograms to reduce computation complexity and processing time. Experimental results show that the proposed algorithm can generate high brightness, good contrast and appealing images that surpass the performance of many state-of-the-art tone
mapping algorithms.

***Some Results***

| <img src="http://jieyang1987.github.io/files/AtriumMorning/AtriumMorning_Gu.jpg" width="250px" alt="图片说明" > |<img src="http://jieyang1987.github.io/files/AtriumMorning/AtriumMorning_durand.jpg" width="250px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/AtriumMorning/AtriumMorning_paris.jpg" width="250px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/AtriumMorning/AtriumMorning_mshist.png" width="250px" alt="图片说明" >|
|:----------:|:-------------:|:------:|:-----:|
| Gu *et al.* [1] |  Durand *et al.* [2] | Paris *etl al.* [3] | The proposed |

| <img src="http://jieyang1987.github.io/files/garage/gu.jpg" width="250px" alt="图片说明" > |<img src="http://jieyang1987.github.io/files/garage/durand.jpg" width="250px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/garage/paris.jpg" width="250px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/garage/ours.bmp" width="250px" alt="图片说明" >|
|:----------:|:-------------:|:------:|:-----:|
| Gu *et al.* [1] |  Durand *et al.* [2] | Paris *etl al.* [3] | The proposed |

| <img src="http://jieyang1987.github.io/files/memorial/gu.jpg" width="250px" alt="图片说明" > |<img src="http://jieyang1987.github.io/files/memorial/durand.jpg" width="250px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/memorial/memorial_Paris.png" width="250px" alt="图片说明" >|<img src="http://jieyang1987.github.io/files/memorial/mshist.bmp" width="250px" alt="图片说明" >|
|:----------:|:-------------:|:------:|:-----:|
| Gu *et al.* [1] |  Durand *et al.* [2] | Paris *etl al.* [3] | The proposed |

***Reference***

[1] B. Gu, W. Li, M. Zhu, and M. Wang, “Local edge-preserving multiscale decomposition for high dynamic range image tone mapping,” IEEE Transactions on image Processing, vol. 22, no. 1, pp. 70–79, 2013.

[2] F. Durand and J. Dorsey, “Fast bilateral filtering for the display of high dynamic-range images,” in ACM transactions on graphics (TOG), vol. 21,
pp. 257–266, ACM, 2002

[3] S. Paris, S. W. Hasinoff, and J. Kautz, “Local laplacian filters: edgeaware image processing with a laplacian pyramid,” Communications of
the ACM, vol. 58, no. 3, pp. 81–91, 2015



***Code***

Matlab and Python Code are available for [download](./mshist_code.html)
