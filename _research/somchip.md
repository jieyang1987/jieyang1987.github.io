---
title: A 1000 fps Vision Chip Based on a Dynamically Reconfigurable Hybrid Architecture Comprising a PE Array Processor and Self-Organizing Map Neural Network
permalink: /research/somchip.html
---
Published in *IEEE Solid-State Circuits,IEEE Journal*

Cong Shi, **Jie Yang**, Ye Han, Zhongxiang Cao, Qi Qin, Liyuan Liu, Nan-Jian Wu, Zhihua Wang.

[[Paper]](https://jieyang1987.github.io/files/jssc2014.pdf)

***Abstract***
This paper proposes a vision chip hybrid architecture with dynamically reconfigurable processing element (PE) array processor and self-organizing map (SOM) neural network. It
integrates a high speed CMOS image sensor, three von Neumann-type processors, and a non-von Neumann-type bio-inspired SOM neural network. The processors consist of a pixel-parallel PE array processor with *O(N $\times$ N)* parallelism, a row-parallel
row-processor (RP) array processor with *O(N)* parallelism
and a thread-parallel dual-core microprocessor unit (MPU) with *O(2)*
parallelism. They execute low-, mid- and high-level image
processing, respectively. The SOM network speeds up high-level
processing in pattern recognition tasks by , which
improves the chip performance remarkably. The SOM network
can be dynamically reconfigured from the PE array to largely save
chip area. A prototype chip with a 256 $\times$ 256 image sensor, a reconfigurable
64 $\times$ 64 PE array processor 16 $\times$ 16 SOM network,
a 64 $\times$ 1 RP array processor and a dual-core 32-bit MPU was
implemented in a 0.18 m CMOS image sensor process. The chip
can perform image capture and various-level image processing at
a high speed and in flexible fashion. Various complicated applications
including M-S functional solution, horizon estimation, hand
gesture recognition, face recognition are demonstrated at high
speed from several hundreds to 1000 fps.
![](https://jieyang1987.github.io/files/som_chip.png)
