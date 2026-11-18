---
title: "Representation Pump：深层如何应用浅层信息 (inspired by attention residual & variable-width transformer)"
draft: false
---

在iclr2027第一轮评审结束以后，初评获得443的variable-width transformer (Wu et al., 2026)引起了我的注意。比起他可变的宽度，我更吸引于它shallow layers到deep layers hidden state的传递作用。 这让我联想了Kimi在今年年初的一篇工作Attention residual也是用于连接不同层的hidden state和DeepSeek的mHC-一种维护多个hidden state stream的方法。 由此，我详细研究了现在对于deep layers应用shallow layers信息的做法，分为hidden state和KV两个部分。

<p><strong>TL;DR</strong></p>

<p>hidden state pump在工程难度更小的同时获得可观的training收益， KV state pump会对既有结构改变过大以及没有大模型(&gt;100B)的验证结果sota models中并未采用。</p>

## 1. 为什么需要 representation pump

<p>本文把「让深层直接读到浅层表示」的机制统称为 representation pump。先约定几个贯穿全文的概念：</p>

<ul>
<li><strong>residual stream</strong>：Transformer 中沿深度传递的主干向量。每一层从它读取输入，再把自己的输出加回去；第 ℓ 层读到的 residual stream 记为 h_ℓ。</li>
<li><strong>hidden-state pump</strong>：把浅层表示送进 residual stream，作为后面层的输入。深层读到的是当前token 自己在浅层的表示。</li>
<li><strong>KV pump</strong>：把浅层表示送进注意力的 K/V（key/value）。深层的注意力读到的是此前各 token 在浅层的表示。</li>
</ul>

### 1a. 问题：标准残差下，深层很难再拿到浅层的表示

<p>标准残差（每一层把自己的输出直接加回 residual stream）让每一层只能读到一样东西：此前所有层输出的等权总和。浅层的信息还在这个总和里，但会被埋没、被平均、被压缩，而且没有办法单独取回。具体有三个问题。</p>

<p><strong>uniform aggregation</strong>（均匀聚合）。把残差展开：记 v_0 为 embedding，f_j 为第 j 层的变换（attention或 MLP 子层），v_j 为它的输出，α_{j→ℓ} 为第 j 层的输出在第 ℓ 层输入 h_ℓ 中的权重。第 ℓ 层读到的是：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-01.png" alt="h_ℓ = Σ_{j=0}^{ℓ−1} α_{j→ℓ} v_j, v_j = f_j(h_j), α_{j→ℓ} ≡ 1" width="314" height="57" loading="lazy" decoding="async"></div>

<p>权重恒为 1，不随输入变化。AttnRes（Kimi 的 Attention Residuals，见 2a）指出，序列方向的混合和MoE 的专家路由早已用上随输入变化的权重，深度方向的聚合却仍由固定的单位权重决定，没有机制去放大或压低某一层的贡献；它把背后的原因称为 single-state bottleneck，即所有早期层的输出都被压进同一个状态。更进一步，第 ℓ 层只通过这个和看到此前各层，而下面这个映射不是单射（不同的输入会被映射到同一个输出）：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-02.png" alt="(v_0, …, v_{ℓ−1}) ↦ Σ_{j=0}^{ℓ−1} v_j" width="168" height="58" loading="lazy" decoding="async"></div>

<p>总和相同的两组层输出，给第 ℓ 层的输入完全一样，它分不出哪一层写了什么。</p>

<p><strong>PreNorm dilution</strong>（PreNorm 稀释）。PreNorm 指只在每个子层的入口做归一化（LayerNorm 或RMSNorm），residual stream 本身不归一化。于是 residual stream 是各层输出的等权和，范数随深度大致线性增长；第 j 层的写入在第 ℓ 层输入中的占比（下式记为 share_{j→ℓ}）也就随之变小：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-03.png" alt="‖h_ℓ‖ = O(ℓ), share_{j→ℓ} ≈ ‖v_j‖ / ‖h_ℓ‖" width="228" height="48" loading="lazy" decoding="async"></div>

<p>其中 ‖·‖ 为向量范数，O(ℓ) 表示与层数 ℓ 同阶增长。所以早期层的信息被埋没，深层必须写出更大的输出才有影响。</p>

<figure>
<img src="/assets/posts/representation-pump/attention-residual-norms.png" alt="基线和 Block AttnRes 的验证损失、输出幅度与梯度幅度。" width="651" height="229" loading="lazy" decoding="async">
<figcaption>图源：Kimi Team，<em>Attention Residuals</em>，arXiv:2603.15031（2026），Figure 5。(a) 训练中的验证 loss；(b) 训练结束时各 Transformer 块输出的幅度；(c) 各块的梯度幅度。基线的 hidden 幅度随深度单调增长，深层被迫学出越来越大的输出。</figcaption>
</figure>

<p><strong>representation collapse</strong>（表示坍缩）。深层里不同 token 的表示越来越难区分。这可以从注意力本身的形式推出来，分两步。第一步，注意力是凸组合（权重非负、和为 1 的加权平均）。记第 i 个 token 的注意力输出为 o_i，第 j 个 token 的 value 为 v_j（这里的下标指 token，不是层），Q、K 为 query、key 矩阵，d 为 key 的维度，A 为注意力权重矩阵：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-04.png" alt="o_i = Σ_j A_{ij} v_j, A = softmax(QKᵀ / √d), A_{ij} ≥ 0, Σ_j A_{ij} = 1" width="445" height="53" loading="lazy" decoding="async"></div>

<p>softmax 之后 A 的每行非负、和为 1，所以每个输出 o_i 都落在 {v_j} 的凸包（所有 v_j 的凸组合构成的集合）里；因此任意两个输出之间的距离，不超过任意两个 value 之间的最大距离：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-05.png" alt="max_{i,k} ‖o_i − o_k‖ ≤ max_{j,l} ‖v_j − v_l‖" width="213" height="35" loading="lazy" decoding="async"></div>

<p>注意力这一步只会把 token 往一起拉，不会推开。第二步，叠起来就是 rank collapse（秩坍缩）：A 是行随机矩阵（每行非负、和为 1），每层乘一次，叠加起来就是反复取平均，各 token 的表示越来越接近同一个向量，表示矩阵的秩趋于 1。Dong 等（ICML 2021）把各 token 的表示按行排成矩阵 X，用下面的残差衡量 X 离“各行都相同的秩 1 矩阵”有多远（1 是全 1 向量，x 取使范数最小的那个）：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-06.png" alt="res(X) = X − 1 xᵀ，其中 1 是全 1 向量" width="128" height="29" loading="lazy" decoding="async"></div>

<p>并证明对去掉 skip connection（残差连接）和 MLP 的纯 self-attention 网络（SAN），经过 L 层之后：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-07.png" alt="‖res(SAN(X))‖_{1,∞} ≤ (4γβ / √d_{qk})^((3^L−1)/2) ‖res(X)‖_{1,∞}^(3^L)" width="321" height="64" loading="lazy" decoding="async"></div>

<p>其中 ‖·‖_{1,∞} 是论文使用的混合范数（ℓ1 范数与 ℓ∞ 范数乘积的平方根），d_qk 是 query/key 的维度，β是各层 W_QK（query 与 key 投影矩阵之积）与 W_V（value 投影矩阵）范数乘积的上界，γ 是与注意力分数大小有关的常数。指数里是 3^L：当下式成立、且初始的 res 不大时，res 以双指数速度趋于 0，所有token 收敛成同一个向量，论文称之为 token uniformity。</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-08.png" alt="4γβ &lt; √d_{qk}" width="86" height="27" loading="lazy" decoding="async"></div>

<p>真实模型不会坍缩到秩 1：同一篇论文指出，skip connection 和 MLP 能阻止这种退化。所以representation collapse 是一种倾向，而不是终点；Noci 等（NeurIPS 2022）进一步说明，token 表示一旦高度对齐，Q、K 的梯度会趋于消失。</p>

<p>这些问题的共同后果是深层没有被充分利用：AttnRes 引用的经验结果是，相当一部分层可以剪掉而几乎不损失性能（Gromov 等，2024）。而且表示一旦被稀释，很难从当前状态重新算出来：&gt;&lt;former 的消融中，层重新变宽时如果训练一个投影层（用可学矩阵把窄表示映射回宽维度）来补回维度，loss 是 3.150，比等宽基线（3.138）还差。我的理解是，要拿回浅层表示，只能回到源头去取。</p>

### 1b. 为什么 representation pump 有用

<p>两种 pump 的共同点是让深层绕过那个累加起来的总和，直接读到浅层的表示；区别在于读的是谁（当前token 自己，还是此前各 token）、从哪里进入（residual stream，还是注意力的 K/V）。它们对 1a 中三个问题的缓解方式如下：</p>

<div class="post-table" tabindex="0" role="region" aria-label="表格">
<table><thead>
<tr><th><strong>问题</strong></th><th><strong>hidden-state pump 怎么缓解</strong></th><th><strong>KV pump 怎么缓解</strong></th></tr>
</thead><tbody>
<tr><td>uniform aggregation</td><td>给每层一组跨层权重，按需取回某几层的输出</td><td>按权重挑选混入哪几层的 V 或 K/V</td></tr>
<tr><td>PreNorm dilution</td><td>第 j 层在输入中的占比由权重决定，不再由范数占比决定</td><td>浅层的 V 不必在 residual stream 里“熬”到深层，直接进入深层注意力的读取范围</td></tr>
<tr><td>representation collapse</td><td>取回被注意力反复平均之前的浅层表示</td><td>混入还没被平均多少次的浅层 V，补回 token 级信息</td></tr>
</tbody></table>
</div>

<p>起作用的确实是浅层信息，而不只是多了参数或换了结构：</p>

<ul>
<li>&gt;&lt;former 的消融中，层重新变宽时有两种补维度的方式：补零（新增坐标填 0）和 carry-forward（从之前处理过该坐标的层原样复制）。两者形状完全相同，区别只在是否保留浅层的值：loss 3.124对 3.099。</li>
<li>AttnRes（用注意力取回此前各层的输出，见 2a）在 48B 模型上的训练分析显示，它缓解了 PreNorm dilution：输出幅度沿深度保持有界，梯度范数在各层分布更均匀。</li>
<li>LIMe（每个注意力头从此前所有层取 K/V，见 3b）在深层保持了更高的 value 熵（value 矩阵的矩阵熵），深层 value 的线性可分性（用线性分类器区分不同 token 的容易程度）也更好。</li>
<li>ResFormer（把第一层的 V 加到之后每一层，见 3a）在 82M–468M 模型上，用少 16.11% 的参数、或少 20.3% 的训练数据，达到相同的验证 loss。</li>
</ul>

### 1c. 跨层读取的三种权重

<p>几乎所有 pump 都可以写成同一个形式：当前层 ℓ 发出 query，前序层的输出 v_0, …, v_{ℓ−1} 提供 key 和value，当前层读到的是：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-13.png" alt="h_ℓ = Σ_{j&lt;ℓ} α_{j→ℓ} v_j" width="110" height="43" loading="lazy" decoding="async"></div>

<p>各方法的区别只在权重 α_{j→ℓ} 怎么得到。看 query 和 key 各自从哪里来，就得到三种方式：</p>

<div class="post-table" tabindex="0" role="region" aria-label="表格">
<table><thead>
<tr><th><strong>权重类型</strong></th><th><strong>query</strong></th><th><strong>第 j 层的 key</strong></th><th><strong>权重是否随输入变化</strong></th><th><strong>是否看第 j层装了什么</strong></th><th><strong>代表</strong></th></tr>
</thead><tbody>
<tr><td>static</td><td>无</td><td>无（直接学一个常数）</td><td>否</td><td>否</td><td>DenseFormer、ResFormer、LIMe的 static router、FusedKV</td></tr>
<tr><td>router-like</td><td>当前 token的状态</td><td>学到的参数，每个源层一个固定“槽位”</td><td>是</td><td>否</td><td>MUDD、M3Former、LIMe 的dynamic router、DAGFormer</td></tr>
<tr><td>attention-like</td><td>静态或随输入变化</td><td>由第 j 层自己的输出算出</td><td>是</td><td>是</td><td>AttnRes、MSAR、Depth-Attention</td></tr>
</tbody></table>
</div>

<p>“代表”一栏中的结构分别在第 2 节（hidden-state pump）和第 3 节（KV pump）介绍。</p>

<ul>
<li><strong>static</strong>：α_{j→ℓ} 是训练学到的常数，对所有 token 都一样。MUDD 称为 static dense connections，LIMe 称为 static router。</li>
<li><strong>router-like</strong>：和 MoE（mixture of experts）的 router 类似（MoE 的 router 根据当前 token 为各个专家打分），这里用当前 token 的状态经一个小网络，为每个源层各算出一个权重（MUDD 的写法见下式）。权重随 token 变化，但不看各前序层装了什么：输出的第 j 维永远对应第 j 层。与 MoE 不同，这里不做 top-k（只保留得分最高的 k 个），所有源层都参与加权。</li>
<li><strong>attention-like</strong>：query 与每个前序层的 key 做 softmax，key 来自前序层自己的输出（AttnRes 的写法见下式）。AttnRes 把自己的做法称为 content-dependent selection via softmax attention。</li>
</ul>

<p>MUDD（router-like）的跨层权重如下：X_ℓ 为第 ℓ 层的输入，经 RMSNorm 归一化后过一个两层小网络（权重 W_1、W_2，激活函数 GELU），再加上静态偏置 a_ℓ；输出 A_ℓ 的第 j 维就是第 j 层的权重。</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-14.png" alt="A_ℓ = GELU(RMSNorm(X_ℓ) W_1) W_2 + a_ℓ" width="275" height="28" loading="lazy" decoding="async"></div>

<p>AttnRes（attention-like）的跨层权重如下：w_ℓ 是第 ℓ 层学到的 pseudo-query（一个与输入无关的向量），各前序层的输出 v_j 经 RMSNorm 后充当 key，softmax_j 表示在所有前序层 j 上做 softmax。</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-15.png" alt="α_{j→ℓ} = softmax_j(w_ℓᵀ RMSNorm(v_j))" width="246" height="31" loading="lazy" decoding="async"></div>

<p>动态不等于 attention-like：router-like 是 query 随输入变、key 固定；AttnRes 默认的 pseudo-query是静态的，但 key 来自各层的输出，所以属于 attention-like。</p>

## 2. hidden-state pump

<p>hidden-state pump 把浅层表示送进 residual stream，作为深层的输入。四种主要结构走了四条不同的路：</p>

<ul>
<li><strong>AttnRes</strong>：保留每层的输出，深层用注意力按内容取回。</li>
<li><strong>mHC</strong>：把 residual stream 扩成多条，让更多信息沿深度带下去。</li>
<li><strong>&gt;&lt;former</strong>：让一部分坐标（residual stream 向量的维度分量）绕过窄层、不被改写，深层原样取回。</li>
<li><strong>Gated Residual</strong>：同样把 residual stream 扩成多条，但去掉流间混合，只用门控决定从各条流读多少、写回多少。</li>
</ul>

### 2a. AttnRes：保留每层输出，用注意力取回

<figure>
<img src="/assets/posts/representation-pump/attention-residual-architectures.png" alt="标准残差、Full AttnRes 和 Block AttnRes 的结构对照。" width="615" height="347" loading="lazy" decoding="async">
<figcaption>图源：Kimi Team，<em>Attention Residuals</em>，arXiv:2603.15031（2026），Figure 1。(a) 标准残差，等权相加；(b) Full AttnRes，每层用学到的注意力权重有选择地聚合此前所有层的输出；(c) Block AttnRes，层分块后显存从 O(Ld) 降到O(Nd)。</figcaption>
</figure>

<ul>
<li><strong>做法</strong>：每层有一个学到的 pseudo-query（与输入无关的查询向量），此前各层的输出（含embedding）作为 key 和 value，softmax 后加权求和，作为这一层的输入，这是 Full AttnRes。Block AttnRes 把 L 层分成 N 块，只保留块级表示，显存从 O(Ld) 降到 O(Nd)（d 为隐藏维度）。</li>
<li><strong>权重</strong>：attention-like。</li>
<li><strong>结果</strong>：Block AttnRes 的 scaling law 拟合显示 1.25× 的算力优势，即达到同样的 loss，基线要多用25% 的算力（见下图）；Kimi Linear 48B（MoE，每个 token 激活 3B 参数）、1.4T tokens 上，GPQA-Diamond（研究生水平的科学问答 benchmark）36.9 → 44.4（+7.5）。Kimi K3（2.8T）采用Block 版本。</li>
</ul>

<figure>
<img src="/assets/posts/representation-pump/attention-residual-scaling.png" alt="基线、Full AttnRes 和 Block AttnRes 在不同训练算力下的损失。" width="383" height="348" loading="lazy" decoding="async">
<figcaption>图源：Kimi Team，<em>Attention Residuals</em>，arXiv:2603.15031（2026），Figure 4。横轴为训练算力（PFLOP/s-days），纵轴为 loss；三条虚线是基线、Full AttnRes 和 Block AttnRes 各自的 scaling law 拟合，箭头标出 1.25× 的算力优势。</figcaption>
</figure>

### 2b. mHC：把 residual stream 扩成多条

<figure>
<img src="/assets/posts/representation-pump/hyper-connections.png" alt="残差连接、Hyper-Connections 和 mHC 的结构对照。" width="651" height="340" loading="lazy" decoding="async">
<figcaption>图源：Xie 等（DeepSeek），<em>mHC: Manifold-Constrained Hyper-Connections</em>，arXiv:2512.24880，Figure 1。(a)标准残差：x_l 经过层 F 后加回去；(b) HC：x_l 扩成多条流，用 Res、Pre、Post 三个映射（即正文的 H_res、H_pre、H_post）在流间混合、读出层输入、写回层输出；(c) mHC：三个映射都被投影 P 到各自的约束集合上，其中H_res 的约束集合是 doubly stochastic matrix。</figcaption>
</figure>

<ul>
<li><strong>做法</strong>：沿用 Hyper-Connections（HC，Zhu 等，2025），把 residual stream 扩成 n 条；每层用H_pre（n 条流到子层输入的读权重）读出子层输入，用 H_post（子层输出到 n 条流的写权重）写回，用 H_res（n×n 的流间混合矩阵）在流之间混合。不加约束的 HC 在 27B 训练中出现 loss 突增；mHC 用 Sinkhorn 迭代（交替做行归一化和列归一化）把 H_res 投影为 doubly stochastic matrix（每行、每列都非负且和为 1），多层 H_res 连乘后对信号的最大放大倍数从接近 3000 降到约 1.6。</li>
<li><strong>权重</strong>：由当前状态动态生成，加上可学的静态偏置。</li>
<li><strong>结果</strong>：27B 上最终 loss 比基线低 0.021，BBH（BIG-Bench Hard，一组较难的推理任务）43.8 → 51.0。DeepSeek-V4 和 GLM-5.3-Flash 采用；Qwen3.8-Flash-Next 用的是去掉 H_res 的变体Gated Residual（2d）。</li>
</ul>

### 2c. ><former：让一部分坐标绕过窄层

<figure>
<img src="/assets/posts/representation-pump/variable-width-transformer.png" alt="Variable-Width Transformer 的结构示意图。" width="206" height="264" loading="lazy" decoding="async">
<figcaption>图源：Wu 等，<em>Variable-Width Transformers</em>，arXiv:2606.18246（2026），Figure 1。模型两头宽、中间窄；虚线箭头表示一部分坐标绕过中间的窄层，在层重新变宽时原样取回。</figcaption>
</figure>

<ul>
<li><strong>做法</strong>：模型是 x-shaped 的，两头宽、中间窄；residual stream 与最宽层同宽。窄层只读写 residual stream 向量中靠前的坐标（维度分量），其余坐标 bypass（跳过该层，值保持不变）；层重新变宽时用carry-forward，把每个坐标从最近处理过它的层原样复制过来。</li>
<li><strong>权重</strong>：static，由结构决定。</li>
<li><strong>结果</strong>：2B 规模下，达到等宽基线（所有层同宽的标准 Transformer）的 loss 只需 77.8% 的 FLOPs；相同 loss 下 KV cache 少 14.9%（KV cache 是推理时为已处理 token 缓存的 key/value，大小与平均层宽成正比；两项均为 scaling law 拟合估计，见下图）。500M 消融（表 4）比较了层重新变宽时补维度的方式：carry-forward 3.099，补零（新增坐标填 0）3.124，训练一个投影层（用可学矩阵映射回宽维度）3.150，等宽基线为 3.138；形状相同时，保留浅层的值更好。目前没有查到采用它的开源模型。</li>
</ul>

<figure>
<img src="/assets/posts/representation-pump/variable-width-scaling.png" alt="损失对训练 FLOPs 和平均层宽的对比。" width="651" height="304" loading="lazy" decoding="async">
<figcaption>图源：Wu、Sieberling、Tan、Panda、Polyanskiy、Kim，<em>Variable-Width Transformers</em>，arXiv:2606.18246（2026），Figure 4。左：loss 对训练 FLOPs；右：loss 对平均层宽（与 KV cache 成正比）。</figcaption>
</figure>

### 2d. Gated Residual：去掉流间混合，只用门控读写

<figure>
<img src="/assets/posts/representation-pump/gated-residual.png" alt="Gated Residual 的门控读写结构。" width="349" height="348" loading="lazy" decoding="async">
<figcaption>图源：Qwen Team，<em>On the Design of Qwen3.8-Next Architecture</em>，arXiv:2608.30320，Figure 1。模型由 3 个GDN 层（Gated DeltaNet，一种线性注意力）和 1 个 QSA 层（Qwen Sparse Attention）交替堆叠。每个子层（注意力或 MoE）都先经 GR Read 从扩宽后的 residual stream（图中的四个圆圈，即 4 条流）读出输入，再经 GR Write 把输出写回；预测头和 MTP 模块（预测后续多个 token 的辅助模块）之前也有一次 GR Read。</figcaption>
</figure>

<p>设 residual stream 扩成 n_r = 4 条流 R_1, …, R_{n_r}。每个子层（attention 或 MLP）先对每条流各自做RMSNorm（γ_i 是第 i 条流自己的增益），再把归一化后的各条流拼成一个长向量（下式中的 vec），由它算出两组门控：read gate G 先经 W_d 降到 d/8 维、过 SiLU 激活，再经 W_u 升回、过 sigmoid（σ），给每条流的每个通道一个 0 到 1 之间的值；write gate s 经 W_w 和 2σ，给每条流一个 0 到 2 之间的标量。子层输入 x 是门控后各条流的平均，子层输出 y 按 s_i 加回每条流（⊙ 为逐元素相乘）：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-16.png" alt="R̂_i = RMSNorm(R_i; γ_i), G = σ(W_u SiLU((1/n_r) W_d vec(R̂))), s = 2σ((1/n_r) W_w vec(R̂)); x = (1/n_r) Σ_{i=1}^{n_r} G_i ⊙ R̂_i, y = F(x), R′_i = R_i + s_i y" width="586" height="84" loading="lazy" decoding="async"></div>

<ul>
<li><strong>做法</strong>：沿用 mHC 把 residual stream 扩成多条，但去掉流间混合矩阵 H_res，每个块因此少读一次完整的残差状态。读出时的逐流 RMSNorm 取代了块原来的 pre-norm，所以加宽不增加归一化层。</li>
<li><strong>权重</strong>：由当前各条流动态生成；read gate 逐流、逐通道，write gate 每条流一个标量。论文发现再加静态项没有收益。</li>
<li><strong>结果</strong>：在 25B-A3B（总参数 25B、每个 token 激活 3B 的 MoE）、560B tokens 上，loss 从单条residual 的 1.617 降到 1.590，benchmark 平均分 50.91 → 54.66，与 dynamic mHC（1.594，54.47）相当；在 28 层模型上与 Full AttnRes 持平（1.762）。用 3–4 倍学习率做压力测试时，loss 突增和梯度范数突增更少。Qwen3.8-Flash-Next（Qwen4 架构预览）采用。</li>
</ul>

### 2e. 其他 hidden-state pump

<ul>
<li><strong>DenseFormer</strong>：每个块之后对此前所有表示做加权平均，权重是学到的标量（static）。</li>
<li><strong>MUDD</strong>（MUDDFormer）：由当前状态生成权重（router-like），Q、K、V 和残差四路各用一组跨层混合权重。</li>
<li><strong>DCA</strong>（DeepCrossAttention）：权重由各源层自己的输出决定，形式接近 AttnRes 但不带 softmax；三份混合分别作为 Q、K、V 的输入。</li>
<li><strong>MSAR</strong>（Multi-Stream Attention Residuals）：AttnRes 的 multi-head 推广（像 multi-head attention 一样用多组 query 分别取回），达到同一 loss 的算力加速 1.58 倍（同一论文中 AttnRes 1.35倍、mHC 1.30 倍）。</li>
<li><strong>M3Former</strong>：细粒度的跨层混合（fine-grained cross-layer mixing），权重由当前状态生成（router-like）。</li>
<li><strong>DAGFormer</strong>：用一个预测器为每个 token 生成层与层之间的连接权重（router-like）。</li>
</ul>

## 3. KV pump

<p>KV pump 把浅层表示送进注意力：深层的注意力在当前层原有的 K/V 之外，再读到浅层的表示。四种主要结构走了四条不同的路：</p>

<ul>
<li><strong>ResFormer</strong>：把第一层的 V 加到之后每一层的 V 上。</li>
<li><strong>LIMe</strong>：每个头的 K/V 由此前所有层输出的组合算出。</li>
<li><strong>Depth-Attention</strong>：用当前层的 query 对更早层打分，把它们的 V 混进当前层的 V。</li>
<li><strong>FusedKV</strong>：上半部分各层不再算自己的 K/V，而是由第 1 层和第 n 层的 K/V 融合得到。</li>
</ul>

### 3a. ResFormer：把第一层的 V 加到每一层

<figure>
<img src="/assets/posts/representation-pump/value-residual-learning.png" alt="ResFormer 的 value residual 连接示意图。" width="283" height="348" loading="lazy" decoding="async">
<figcaption>图源：Zhou 等，<em>Value Residual Learning</em>，arXiv:2410.17897，Figure 1 的 (c)(d) 两栏。A 为注意力权重矩阵，V 为value，H 为该层注意力的输出，上标是层号。(c) DenseFormer 在各层输出 H 之间做跨层加权（hidden-state pump）；(d) ResFormer 把第一层的 V¹ 加到之后每一层的 V 上（KV pump）。</figcaption>
</figure>

<p>第 n 层的 value 改为下式。其中 V_1 是第一层的 value，H_{n−1} 是第 n 层的输入（第 n−1 层的输出），W_n^V 是第 n 层的 value 投影矩阵，λ_{n,1}、λ_{n,2} 是混合系数：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-17.png" alt="V_n = λ_{n,1} V_1 + λ_{n,2} H_{n−1} W_n^V" width="185" height="31" loading="lazy" decoding="async"></div>

<ul>
<li><strong>做法</strong>：在当前层的 value 上加上第一层的 value（见上式）。论文的消融中，只有来自第一层的连接有显著收益。</li>
<li><strong>权重</strong>：static，λ 是常数或可学标量。</li>
<li><strong>结果</strong>：82M–468M 模型上，用少 16.11% 的参数、或少 20.3% 的训练数据，达到相同的验证 loss。</li>
</ul>

### 3b. LIMe：每个头从此前所有层取 K/V

<figure>
<img src="/assets/posts/representation-pump/lime-architecture.png" alt="LIMe 各注意力头从此前各层构造 K/V 的示意图。" width="651" height="326" loading="lazy" decoding="async">
<figcaption>示意图：论文没有结构图，本图根据 Gerasimov 等，<em>You Do Not Fully Utilize Transformer's Representation Capacity</em>，arXiv:2502.09245 第 4 节的公式绘制。每个头用自己的一组 softmax 权重 α 混合此前各层的输出 X_m（X_0 为 embedding），得到 Z_h，再经当前层这个头的 K/V 投影；query 仍由 X_{r−1} 算出。条形长度只示意不同的头会取不同的层，不是论文中的真实权重。</figcaption>
</figure>

<p>第 r 层第 h 个头的 K/V 按下式计算。其中 X_m 是第 m 层的输出（X_0 为 embedding），α_{h,m} 是这个头对第 m 层的 softmax 权重，W_h^K、W_h^V 是当前层这个头的 key/value 投影矩阵：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-18.png" alt="Z_h = Σ_{m=0}^{r−1} α_{h,m} X_m, K_h = Z_h W_h^K, V_h = Z_h W_h^V" width="354" height="57" loading="lazy" decoding="async"></div>

<ul>
<li><strong>做法</strong>：每层每个头有一个 router（为每个源层打分的小模块），对此前所有层的输出给出一组 softmax权重，取凸组合后再用当前层的 K/V 投影得到这个头的 K、V；query 不变。</li>
<li><strong>权重</strong>：router 可以与 token 无关（static），也可以由上一层输出生成（router-like）。</li>
<li><strong>结果</strong>：约 1.2B、50B tokens 上，1-shot 平均准确率（每题给 1 个示例时，多项 benchmark 的平均准确率）58.4，同规模 LLaMA 架构基线为 57.7；层数越多优势越明显（32、64、128 层）。router 的分析显示，深层明显转向更早的层。</li>
</ul>

<figure>
<img src="/assets/posts/representation-pump/lime-value-representations.png" alt="is、are、were、was 的 value 表示在各层的 t-SNE 图。" width="651" height="306" loading="lazy" decoding="async">
<figcaption>图源：Gerasimov 等，<em>You Do Not Fully Utilize Transformer's Representation Capacity</em>，arXiv:2502.09245，Figure 6。is / are / were / was 四个相近 token 的 value 向量在各层的 t-SNE（把高维向量降到二维的可视化方法）：LLaMA 从第 7 层起四类已经混在一起，LIMe 到第 16 层仍能分开。</figcaption>
</figure>

### 3c. Depth-Attention：在 V 中混入更早层的 V

<figure>
<img src="/assets/posts/representation-pump/depth-attention.png" alt="Depth-Attention 与其他注意力方案的对照。" width="597" height="347" loading="lazy" decoding="async">
<figcaption>图源：Zeng 等，<em>Depth-Attention: Cross-Layer Value Mixing for Language Models</em>，arXiv:2606.05014，Figure 1。左上：普通 self-attention 在序列方向混合信息。左下：Depth-Attention 在深度方向上，用当前层的 query 对第0、s、2s、… 层的 key 打分（s 为取层的间隔），混合对应的 value 得到 ṽ；复杂度 O(TL/s) 中 T 为序列长度，L 为层数。中：混合后的 Ṽ 与当前层原来的 Q、K 一起做 causal self-attention。</figcaption>
</figure>

<ul>
<li><strong>做法</strong>：在 self-attention 之前，对同一个 token，用当前层的 query 对当前层和部分更早层的 key 做softmax，按权重混合对应的 value，再用原来的 Q、K 照常做 self-attention。</li>
<li><strong>权重</strong>：attention-like。</li>
<li><strong>结果</strong>：1.5B 上 perplexity（困惑度，由平均交叉熵 loss 取指数得到，越低越好）8.17 → 7.77，3B 上7.55 → 7.25；同一张表中优于 DenseFormer、AttnRes 和 mHC，但 3B 上对 AttnRes 的优势很小（7.25 对 7.27）。消融中只混 V 最好，只混 K 没有收益。</li>
</ul>

### 3d. FusedKV：用第 1 层和第 n 层的 K/V 重建上半部分的 K/V

<figure>
<img src="/assets/posts/representation-pump/fused-kv.png" alt="FusedKV 对比中的注意力和 K/V 共享方式。" width="641" height="348" loading="lazy" decoding="async">
<figcaption>图源：Lin 等，<em>Reconstructing KV Caches with Cross-layer Fusion For Enhanced Transformers</em>，arXiv:2512.03870（ICLR 2026）。(a) Vanilla：每层自己计算 K/V；(b) FusedKV-Lite：上半部分各层直接复用第 n 层的 K 和第 1 层的 V；(c) FusedKV：上半部分各层的 K、V 由第 1 层和第 n 层的 K、V 按可学权重融合（⊗）。</figcaption>
</figure>

<p>设模型共 2n 层：第 1 到 n 层照常计算并缓存自己的 K/V，第 n+1 到 2n 层不再计算 K/V，而是由第 1 层（最浅层）和第 n 层（中间层）的 K/V 融合得到。下式中的 w 是第 i 层可学的权重向量（上标标明它作用在哪一层的 K 或 V 上），⊙ 表示逐元素相乘：</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-19.png" alt="K_i = w_i^{K,1} ⊙ K_1 + w_i^{K,n} ⊙ K_n, V_i = w_i^{V,1} ⊙ V_1 + w_i^{V,n} ⊙ V_n, i = n + 1, …, 2n" width="558" height="32" loading="lazy" decoding="async"></div>

<ul>
<li><strong>做法</strong>：论文的分析发现，高层的 value 主要来自最底层，高层的 key 则同时来自底层和中间层，因此用第 1 层和第 n 层的 K/V 来重建上半部分的 K/V。融合作用在加过 RoPE（旋转位置编码）的 key上，融合后不需要重新施加位置编码。FusedKV-Lite 不做加权，直接让上半部分复用第 n 层的 K 和第1 层的 V。</li>
<li><strong>权重</strong>：static，融合权重是逐通道的可学向量，与 token 无关。</li>
<li><strong>结果</strong>：KV cache 和 prefill 延迟都约减半。验证 loss（越低越好，前一个数为标准 Transformer）在332M 上为 2.651 → 2.642，650M 上 2.483 → 2.474，1.5B 上 2.241 → 2.221，4B 上 2.002 → 1.978；同样省 KV cache 的 YOCO、CLA 在 1.5B 上为 2.244 和 2.258，反而不如标准Transformer。1.5B 上 FusedKV 的收敛速度约为标准 Transformer 的 1.26 倍。</li>
</ul>

## 4. 前沿模型的选择

<div class="post-table" tabindex="0" role="region" aria-label="表格">
<table><thead>
<tr><th><strong>模型</strong></th><th><strong>设计</strong></th><th><strong>pump</strong></th><th><strong>权重来源</strong></th><th><strong>目的</strong></th></tr>
</thead><tbody>
<tr><td>Kimi K3（2.8T，2026-07）</td><td>Block AttnRes</td><td>hidden</td><td>attention-like（静态 pseudo-query）</td><td>质量</td></tr>
<tr><td>DeepSeek-V4</td><td>mHC，多条并行 residual stream</td><td>hidden，residual stream expansion</td><td>动态，由当前状态生成</td><td>质量、稳定性</td></tr>
<tr><td>GLM-5.3-Flash（320B-A18B，即总参数 320B、每 token 激活 18B）</td><td>DeepSeek-V4 式 mHC，4 条流</td><td>hidden，residual stream expansion</td><td>动态，由当前状态生成</td><td>质量</td></tr>
<tr><td>Qwen3.8-Flash-Next（125B-A6B，2026-08，Qwen4 架构预览）</td><td>Gated Residual：residual stream扩成 4 条，逐元素的 read gate 加每条流一个标量的 write gate；没有流间混合矩阵</td><td>hidden，residual stream expansion</td><td>动态，由当前状态生成</td><td>质量、训练稳定性</td></tr>
</tbody></table>
</div>

<p><strong>为什么只用 hidden-state pump？</strong> 至少到目前为止，前沿开源模型用的都是 hidden-state pump，没有查到采用 KV pump 的，也没有哪家公开说明过原因。我认为主要有两点：</p>

<ul>
<li><strong>与 MLA 的推理优化冲突</strong>（我的分析）：MLA（Multi-head Latent Attention，DeepSeek-V2 提出）把K/V 压缩成一个低维的 latent 向量再缓存；推理时，V 的上投影矩阵（latent 到 V）可以和输出投影矩阵预先相乘、合成一个矩阵（称为吸收），所以 V 并不显式算出来。ResFormer、Depth-Attention 是在投影之后跨层混合 V；放到 MLA 上，要么把 V 显式算出来，要么每层解码时多读一份别的层（如第一层）的 latent cache，增加的正是 MLA 想省掉的访存。</li>
<li><strong>改的是注意力内部，工程上更难维护</strong>：hidden-state pump 只改块与块之间的 residual 路径，Qwen把 Gated Residual 的读和写各融合成一个 kernel，并把 residual state 存成 FP8（8 位浮点数）来减少访存。KV pump 要改的是注意力读的内容，牵涉注意力 kernel 和 KV cache 的布局；Depth-Attention 论文也把"没有融合进注意力 kernel"列为限制。</li>
</ul>

## 5. 来自 Mistral Large 4 训练的警示：只看 BPB 不够

<p>本文引用的对照实验只看 pretrain 阶段的 BPB（bits per byte，与 loss 等价的指标）或 perplexity，没有一项看过 mid-train（预训练后期的继续训练）或 SFT（监督微调）之后的 agentic 表现（多步调用工具、自主完成任务的能力）。</p>

<p>Mistral Large 4 是一个反例。它最初用 sliding window（每个 token 只看最近 512 个 token）、CLA（相邻层共用 KV）和 YOCO（后半段各层共用中间层的 KV），把 KV cache 压到全注意力的 1/16，pretrain评测没有发现问题；直到 SFT 之后，长上下文 agentic 任务才明显变弱。mid-train 之后，perplexity 相近的架构在 SWE-bench Verified（修复真实 GitHub issue 的代码评测）上分数并不相同，而 MMLU Redux（多学科知识选择题）和 perplexity 走势一致。Mistral 最终去掉了 sliding window 和 CLA，改用agentic 评测指导架构决策。（细节来自 alphaXiv 对 Mistral 报告的总结。）</p>

<p>CLA、YOCO 和 pump 一样，都是改变层间 K/V 的结构改动。所以评估 pump 时，除了 BPB，还应在相同算力下做完同样的 mid-train 或 SFT，再比较下游 agentic 任务；Mistral 也提到更长的训练可能缩小这一差距，这仍需实验确认。</p>

## 6. 结论

<ul>
<li><strong>hidden-state pump</strong>：把浅层表示送进 residual stream，作为深层的输入。AttnRes 保留每层输出、用注意力取回，mHC 把 residual stream 扩成多条，&gt;&lt;former 让一部分坐标绕过窄层，Gated Residual 去掉流间混合、只用门控读写；四者都带来了可观的训练收益。</li>
<li><strong>KV pump</strong>：把浅层表示送进注意力，在当前层的 V 之外再读到浅层的表示，如 ResFormer、LIMe、Depth-Attention 和 FusedKV；目前的验证都在 4B 以内。</li>
<li><strong>前沿模型只用 hidden-state pump</strong>：KV pump 与 MLA 的推理优化冲突，又要改动注意力内部，对infra 的要求更高。</li>
</ul>

## References

<ul>
<li><a href="https://arxiv.org/pdf/2603.15031">Attention Residuals (Kimi Team, 2026)</a></li>
<li><a href="https://arxiv.org/html/2512.24880v2">mHC: Manifold-Constrained Hyper-Connections</a></li>
<li><a href="https://arxiv.org/abs/2409.19606">Hyper-Connections (Zhu et al., 2025)</a></li>
<li><a href="https://arxiv.org/abs/2606.18246">Variable-Width Transformers / &gt;&lt;former (Wu et al., 2026)</a></li>
<li><a href="https://arxiv.org/abs/2402.02622">DenseFormer: Enhancing Information Flow in Transformers via Depth Weighted Averaging (Pagliardini et al., NeurIPS 2024)</a></li>
<li><a href="https://arxiv.org/abs/2502.12170">MUDDFormer</a></li>
<li><a href="https://arxiv.org/abs/2502.06785">DeepCrossAttention (Heddes et al., ICML 2025)</a></li>
<li><a href="https://arxiv.org/abs/2610.13630">Multi-Stream Attention Residuals (MSAR)</a></li>
<li><a href="https://arxiv.org/abs/2611.02436">M3Former: Fine-Grained Cross-Layer Mixing for Transformers (Han et al., 2026)</a></li>
<li><a href="https://arxiv.org/html/2610.19625">DAGFormer</a></li>
<li><a href="https://arxiv.org/html/2410.17897v5">Value Residual Learning (ResFormer, Zhou et al.)</a></li>
<li><a href="https://arxiv.org/html/2502.09245v2">You Do Not Fully Utilize Transformer's Representation Capacity (LIMe, Gerasimov et al., 2025)</a></li>
<li><a href="https://arxiv.org/html/2606.05014">Depth-Attention: Cross-Layer Value Mixing for Language Models (Zeng et al., 2026)</a></li>
<li><a href="https://arxiv.org/abs/2512.03870">FusedKV</a></li>
<li><a href="https://proceedings.mlr.press/v139/dong21a.html">Attention is Not All You Need: Pure Attention Loses Rank Doubly Exponentially with Depth (Dong et al., ICML 2021)</a></li>
<li><a href="https://proceedings.neurips.cc/paper_files/paper/2022/hash/ae0cba715b60c4052359b3d52a2cff7f-Abstract.html">Signal Propagation in Transformers: Theoretical Perspectives and the Role of Rank Collapse (Noci et al., NeurIPS 2022)</a></li>
<li><a href="https://arxiv.org/abs/2403.17887">The Unreasonable Ineffectiveness of the Deeper Layers (Gromov et al., 2024)</a></li>
<li><a href="https://arxiv.org/html/2607.24653v2">Kimi K3 tech report</a></li>
<li><a href="https://huggingface.co/moonshotai/Kimi-K3">Kimi K3 model card</a></li>
<li><a href="https://arxiv.org/abs/2405.04434">DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model (MLA)</a></li>
<li><a href="https://arxiv.org/pdf/2606.19348">DeepSeek-V4 report</a></li>
<li><a href="https://github.com/huggingface/transformers/blob/main/docs/source/en/model_doc/deepseek_v4.md">DeepSeek-V4 in transformers docs</a></li>
<li><a href="https://sebastianraschka.com/blog/2026/glm-5-3-flash-architecture-notes.html">GLM-5.3-Flash architecture notes</a></li>
<li><a href="https://arxiv.org/pdf/2608.30320">On the Design of Qwen3.8-Next Architecture (Qwen Team, 2026)</a></li>
<li><a href="https://huggingface.co/Qwen/Qwen3.8-Flash-Next">Qwen3.8-Flash-Next model card</a></li>
<li><a href="https://www.alphaxiv.org/abs/2611.mistral-large-4">Mistral Large 4 summary (alphaXiv)</a></li>
<li><a href="https://vllm.ai/blog/2026-10-29-mistral-large-4">Mistral Large 4 on vLLM</a></li>
<li><a href="https://arxiv.org/abs/2405.12981">CLA (Brandon et al., NeurIPS 2024)</a></li>
<li><a href="https://arxiv.org/abs/2405.05254">YOCO</a></li>
</ul>
