---

title: 'Deep EEG & ECG Review'
date: 2019-04-10
permalink: /posts/2019/04/blog-post-1/
---

###Basic concepts

EEG和ECG分别表示脑电图（electroencephalogram）和心电图（electrocardiogram），他们通过电极来分别对脑部和心脏的电信号进行监测。EEG是在头皮（当然也有颅内的情况）收集人体脑部自身产生的微弱生物电，并放大记录而得到的曲线图。EEG所测量的是众多锥体细胞兴奋时的突触后电位的同步总和，脑电图测量来自大脑中神经元的离子电流产生的电压波动。脑电图最常用于癫痫病诊断，因为癫痫通常会导致异常的脑电图。下图就是包含癫痫的脑电图。

![](<https://upload.wikimedia.org/wikipedia/commons/2/26/Spike-waves.png>)

脑电图具有很高的时间分辨率，因为设备可以实时的对脑电波进行采样，但是空间分辨率很差，因为它的测量方式决定了它无法精确的测量某个细小区域的脑电波变化，我认为它是一种十分全局的信号。分析心电图的频率，可以大致推断人所处的状态。



心电图和脑电图类似，也是通过电极的方式来监测电信号。下图为心电图示意，通过观察心电图的可以推断出患者整个心脏跳动的节律，从而诊断出一些普遍的心脏问题。

![](<https://upload.wikimedia.org/wikipedia/commons/b/bd/12leadECG.jpg>)



###Some deep ECG/EEG papers

鉴于目前脑电图和心电图是较为简单的信号获取手段，很多的研究聚焦在使用脑电图来进行癫痫的预测或者使用心电图来进行心脏问题识别。结合深度学习最近几年在学术界风生水起的表现，出现了不少基于深度实现的文章。下面列举一些我觉得最近一两年出现的具有代表性的文章。

##### 算法实现:

- Seizure prediction - ready for a new era 
- Towards accurate prediction of epileptic seizures: A review
- Epilepsyecosystem.org: crowd-sourcing reproducible seizure prediction with long-term
  human intracranial EEG 
- Convolutional neural networks for seizure prediction using intracranial and scalp electroencephalogram
- Integer Convolutional Neural Network for Seizure Detection 
- Epileptic Seizure Prediction Using Big Data and Deep Learning: Toward a Mobile System 
- Crowdsourcing reproducible seizure forecasting in human and canine epilepsy
- Focal onset seizure prediction using convolutional networks 
- Towards improved design and evaluation of epileptic seizure predictors 
- Cardiologist-Level Arrhythmia Detection with Convolutional Neural Networks
- Application of Machine Learning To Epileptic Seizure Detection
- Automatic seizure detection using three dimensional CNN based on multi-channel EEG
- Neonatal Seizure Detection Using Deep Convolutional Neural Networks

#####硬件实现：

CLINK: Compact LSTM Inference Kernel for Energy Efficient Neurofeedback Devices

LANMC: LSTM-Assisted Non-Rigid Motion Correction on FPGA for Calcium Image Stabilization



### Some useful links

- [Predicting epileptic seizures](<https://irakorshunova.github.io/blog/seizures>)
- [Keras implementation of 'Cardiologist-Level Arrhythmia Detection with Convolutional Neural Networks ](<https://github.com/awni/ecg>)



###Database

seizure prediction算法的开发十分依赖于连续的、已经标记的以及长期的数据。目前主要有两个比较好的数据库：



|                           Database                           |       EEG Type       | No. of Patients | No. of Channels | No. of seizures |    Interictal hours    | Status                                                       |
| :----------------------------------------------------------: | :------------------: | :-------------: | :-------------: | :-------------: | :--------------------: | ------------------------------------------------------------ |
|                          Freiburge                           |     intracranial     |       13        |        6        |       59        |         311.4          | (Become part of [EPILEPSIAE](http://www.epilepsiae.eu/) Database) |
|                           CHB-MIT                            |        scalp         |       13        |       22        |       64        |          209           | Public available                                             |
| The European Epilepsy Database([EPILEPSIAE](http://www.epilepsiae.eu/)) | intracranial & scalp |      >250       |      vary       |      >2500      | \> 45,000 Hours of EEG | available for purchase                                       |
|             IEEG.org (short term <14 days data)              |     intracranial     |                 |                 |                 |                        | Public available                                             |
|         Epilepsyecosystem (long term > 1 year data)          |     intracranial     |                 |                 |                 |                        | License                                                      |



### Algorithms

-基于CNN

基于LSTM

基于SVM



###Competitions 







### Key challenges

- 多尺度的脑电图数据使用
  - 目前的脑电图数据，是一种**全局**的数据，虽然具有较高的时间分辨率但是空间分辨率不足，随着更小的电极、甚至是植入式电极的出现，是否能够利用更加**局部**的脑电信号来更好的指导癫痫的预测呢？
- 多种生物数据综合判断

  - 有不少的实验表明，除了脑电图以外，其他生物信号也与癫痫发作有一定的关系，是否使用这样一些信号能够进一步的提高癫痫发作预测呢？
- 获取更多长时间的连续数据用于训练

###到临床应用的差距

- 了解癫痫的发病机理

- 从癫痫患者的角度出发考虑/调研，他们希望产品是什么形式、什么功能，避免闭门造车。
- 各种各样的临床标准



### 硬件实现

