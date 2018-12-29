---
title: High-Speed Target Tracking System Based on a Hierarchical Parallel Vision Processor and Gray-Level LBP Algorithm
permalink: /research/gllbp.html
---
Published in *IEEE Transactions on System, Man, and Cybernetics: Systems*

Yongxing Yang, **Jie Yang**, LiYuan Liu, Jian Liu, and Nanjian Wu.

[[Paper]](https://jieyang1987.github.io/files/tsmc2017.pdf)

***Abstract***

Visual target tracking has made significant advances in past decades. However, fast and robust vision target tracking systems are still greatly demanded. This paper proposes a novel high-speed target tracking system based on hierarchical parallel
vision processor architecture. This system contains three main
parts: 1) a CMOS image sensor; 2) a vision processor; and
3) an actuator with two degrees of freedom. The vision processor
integrates a pixel-parallel processing element (PE) array,
a row-parallel row processor (RP) array, dual-core microprocessor
unit (MPU) and motor controller. The PE array and RP array
can speed up low-level and middle-level image processing operations
by O($M^2$) and O($M$), respectively. The MPU is responsible
for the high-level image processing and the overall chip management.
A novel tracking algorithm based on a gray-level local
binary pattern descriptor is proposed. The descriptor describes
not only local texture feature but also distribution of luminance.
The algorithm increases the robustness of the tracking system
under low resolution scenery and complex background. It can
be carried out by the vision processor with very high efficiency.
Experiment results demonstrate that the system can track a fast
moving target under complex conditions and the vision processor
can achieve over 2000 frames/s processing speed of the target
tracking algorithm with 750 $\times$ 480 image resolution.

![](https://jieyang1987.github.io/files/gllbp.png)
