---
title: Heterogeneous Vision Chip Processor
permalink: /research/hvision.html
---
***Abstract***

This paper proposes a heterogeneous parallel
processor for high-speed vision chip. It contains four levels of
processors with different parallelisms and complexities: processing element (PE) array processor, patch processing unit (PPU)
array processor, self-organizing map (SOM) neural network
processor, and dual-core microprocessor unit (MPU). The finegrained PE array processor, middle-grained PPU array processor,
and SOM neural network processor carry out image processing
in pixel-parallel, patch-parallel, and distributed-parallel fashions,
respectively. The MPU controls the overall system and executes
some serial algorithms. The processor can improve the total
system performance from low-level to high-level image processing
significantly. A prototype is implemented with 64 × 64 PE array,
8 × 8 PPU array, 16 × 24 SOM network, and a dual-core MPU.
The proposed heterogeneous parallel processor introduces a new
degree of parallelism, namely, patch parallel, which is for parallel
local-feature extraction and feature detection. It can flexibly
perform the state-of-the-art computer vision as well as various
image processing algorithms at high speed. Various complicated
applications, including feature extraction, face detection, and
high-speed tracking, are demonstrated.


***Performance***

![Performance](http://jieyang1987.github.io/files/hchip_performance.png)

<!--
![Chip and Packaging Image]

| Technology| 65nm 1P9M |
|:---:|:---:|
|Size | 4mm × 6mm |
|Core Frequency| 200 MHz|
|On-Chip SRAM|320 KB|
|Processing unit | 16 + 512 |
|Word Bit-width| 16-bit Fixed-point / 2*8b0t uint8|
|Peak Performance| 208 GOPS@16bit, 413 GOPS@8bit)
|I/O Bandwidth| 3.2 Gbps (duplex)|
-->
