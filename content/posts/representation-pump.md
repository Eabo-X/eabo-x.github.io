---
title: "Representation Pump: How Deep Layers Use Shallow-Layer Information (inspired by attention residual & variable-width transformer)"
date: "2026-11-18"
category: "tech"
layout: "essay"
draft: false
citationAliases:
  AttnRes: https://arxiv.org/pdf/2603.15031
  Full AttnRes: https://arxiv.org/pdf/2603.15031
  Block AttnRes: https://arxiv.org/pdf/2603.15031
  attention residual: https://arxiv.org/pdf/2603.15031
  variable-width transformer: https://arxiv.org/abs/2606.18246
  "><former": https://arxiv.org/abs/2606.18246
  HC: https://arxiv.org/abs/2409.19606
  MUDD: https://arxiv.org/abs/2502.12170
  DCA: https://arxiv.org/abs/2502.06785
  Gated Residual: https://arxiv.org/pdf/2608.30320
  Kimi K3: https://arxiv.org/html/2607.24653v2
  DeepSeek-V4: https://arxiv.org/pdf/2606.19348
  GLM-5.3-Flash: https://sebastianraschka.com/blog/2026/glm-5-3-flash-architecture-notes.html
  Qwen3.8-Flash-Next: https://arxiv.org/pdf/2608.30320
  Mistral Large 4: https://www.alphaxiv.org/abs/2611.mistral-large-4
  Kimi Team: https://arxiv.org/pdf/2603.15031
  Xie et al.: https://arxiv.org/html/2512.24880v2
  Xie 等: https://arxiv.org/html/2512.24880v2
  Lin et al.: https://arxiv.org/abs/2512.03870
  Lin 等: https://arxiv.org/abs/2512.03870
  Reconstructing KV Caches with Cross-layer Fusion For Enhanced Transformers: https://arxiv.org/abs/2512.03870
---

After the first round of ICLR 2027 reviews, the variable-width transformer (Wu et al., 2026), which received initial scores of 4/4/3, caught my attention. More than its variable width, I was drawn to how it carries hidden states from shallow layers to deep layers. This reminded me of Kimi's Attention Residuals from earlier this year, which also connects hidden states across layers, and of DeepSeek's mHC, a method that maintains multiple hidden-state streams. So I took a detailed look at current approaches that let deep layers use information from shallow layers, split into two parts: hidden state and KV.

<p><strong>TL;DR</strong></p>

<p>Hidden-state pumps bring sizeable training gains at a lower engineering cost. KV-state pumps change the existing architecture too much and have no validation results on large models (&gt;100B), so SOTA models have not adopted them.</p>

## 1. Why we need representation pump

<p>In this post, any mechanism that lets deep layers read shallow-layer representations directly is called a representation pump. A few concepts are used throughout:</p>

<ul>
<li><strong>residual stream</strong>: the main vector passed along the depth of a Transformer. Each layer reads its input from it and adds its own output back; the residual stream read by layer ℓ is written h_ℓ.</li>
<li><strong>hidden-state pump</strong>: sends shallow-layer representations into the residual stream as input to later layers. Deep layers read the current token's own shallow-layer representations.</li>
<li><strong>KV pump</strong>: sends shallow-layer representations into the attention K/V (key/value). Deep-layer attention reads the shallow-layer representations of earlier tokens.</li>
</ul>

### 1a. The problem: under standard residuals, deep layers can hardly get shallow representations back

<p>Standard residuals (each layer adds its output directly back to the residual stream) let every layer read only one thing: the equal-weight sum of all earlier layers' outputs. Shallow-layer information is still in this sum, but it gets buried, averaged and compressed, and there is no way to retrieve it on its own. There are three concrete problems.</p>

<p><strong>uniform aggregation</strong>. Unroll the residual: let v_0 be the embedding, f_j the transform of layer j (an attention or MLP sublayer), v_j its output, and α_{j→ℓ} the weight of layer j's output in layer ℓ's input h_ℓ. Layer ℓ reads:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-01.png" alt="h_ℓ = Σ_{j=0}^{ℓ−1} α_{j→ℓ} v_j, v_j = f_j(h_j), α_{j→ℓ} ≡ 1" width="314" height="57" loading="lazy" decoding="async"></div>

<p>The weights are always 1 and do not depend on the input. AttnRes (Kimi's Attention Residuals, see 2a) points out that mixing along the sequence and expert routing in MoE have long used input-dependent weights, while aggregation along depth is still fixed at unit weights, with no mechanism to amplify or suppress any layer's contribution; it calls the underlying cause the single-state bottleneck, meaning all earlier layers' outputs are squeezed into one state. Further, layer ℓ sees earlier layers only through this sum, and the following map is not injective (different inputs can map to the same output):</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-02.png" alt="(v_0, …, v_{ℓ−1}) ↦ Σ_{j=0}^{ℓ−1} v_j" width="168" height="58" loading="lazy" decoding="async"></div>

<p>Two sets of layer outputs with the same sum give layer ℓ exactly the same input, so it cannot tell which layer wrote what.</p>

<p><strong>PreNorm dilution</strong>. PreNorm means normalization (LayerNorm or RMSNorm) is applied only at the entrance of each sublayer, while the residual stream itself is not normalized. The residual stream is then an equal-weight sum of layer outputs, its norm grows roughly linearly with depth, and the share of layer j's write in layer ℓ's input (written share_{j→ℓ} below) shrinks accordingly:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-03.png" alt="‖h_ℓ‖ = O(ℓ), share_{j→ℓ} ≈ ‖v_j‖ / ‖h_ℓ‖" width="228" height="48" loading="lazy" decoding="async"></div>

<p>Here ‖·‖ is the vector norm and O(ℓ) means growth of the same order as the layer index ℓ. So early-layer information gets buried, and deep layers must write ever larger outputs to have any effect.</p>

<figure>
<img src="/assets/posts/representation-pump/attention-residual-norms.png" alt="Validation loss, output magnitude, and gradient magnitude for the baseline and Block AttnRes." width="651" height="229" loading="lazy" decoding="async">
<figcaption>Source: Kimi Team, <em>Attention Residuals</em>, arXiv:2603.15031 (2026), Figure 5. (a) Validation loss during training; (b) output magnitude of each Transformer block at the end of training; (c) gradient magnitude of each block. In the baseline, hidden magnitude grows monotonically with depth, forcing deep layers to learn ever larger outputs.</figcaption>
</figure>

<p><strong>representation collapse</strong>. In deep layers, representations of different tokens become harder and harder to tell apart. This follows from the form of attention itself, in two steps. Step one: attention is a convex combination (a weighted average with non-negative weights summing to 1). Let o_i be the attention output of token i, v_j the value of token j (here the subscript indexes tokens, not layers), Q and K the query and key matrices, d the key dimension, and A the attention weight matrix:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-04.png" alt="o_i = Σ_j A_{ij} v_j, A = softmax(QKᵀ / √d), A_{ij} ≥ 0, Σ_j A_{ij} = 1" width="445" height="53" loading="lazy" decoding="async"></div>

<p>After softmax each row of A is non-negative and sums to 1, so every output o_i lies in the convex hull of {v_j} (the set of all convex combinations of the v_j); hence the distance between any two outputs is no larger than the largest distance between two values:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-05.png" alt="max_{i,k} ‖o_i − o_k‖ ≤ max_{j,l} ‖v_j − v_l‖" width="213" height="35" loading="lazy" decoding="async"></div>

<p>This attention step only pulls tokens together and never pushes them apart. Step two: stacking gives rank collapse. A is a row-stochastic matrix (each row non-negative and summing to 1); multiplying by one at every layer amounts to repeated averaging, so token representations approach the same vector and the rank of the representation matrix tends to 1. Dong et al. (ICML 2021) stack token representations as the rows of a matrix X and use the residual below to measure how far X is from "a rank-1 matrix with identical rows" (1 is the all-ones vector, and x is chosen to minimize the norm):</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-06.png" alt="res(X) = X − 1 xᵀ, where 1 is the all-ones vector" width="128" height="29" loading="lazy" decoding="async"></div>

<p>They prove that for a pure self-attention network (SAN) with skip connections (residual connections) and MLPs removed, after L layers:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-07.png" alt="‖res(SAN(X))‖_{1,∞} ≤ (4γβ / √d_{qk})^((3^L−1)/2) ‖res(X)‖_{1,∞}^(3^L)" width="321" height="64" loading="lazy" decoding="async"></div>

<p>Here ‖·‖_{1,∞} is the composite norm used in the paper (the square root of the product of the ℓ1 and ℓ∞ norms), d_qk is the query/key dimension, β bounds the product of the norms of each layer's W_QK (the product of the query and key projections) and W_V (the value projection), and γ is a constant related to the magnitude of attention scores. The exponent is 3^L: when the condition below holds and the initial res is not large, res goes to 0 doubly exponentially and all tokens converge to the same vector, which the paper calls token uniformity.</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-08.png" alt="4γβ &lt; √d_{qk}" width="86" height="27" loading="lazy" decoding="async"></div>

<p>Real models do not collapse to rank 1: the same paper points out that skip connections and MLPs prevent this degeneration. So representation collapse is a tendency, not an endpoint; Noci et al. (NeurIPS 2022) further show that once token representations are highly aligned, the gradients of Q and K tend to vanish.</p>

<p>The shared consequence of these problems is that deep layers are under-used: AttnRes cites the empirical result that a substantial fraction of layers can be pruned with almost no loss in performance (Gromov et al., 2024). And once a representation is diluted, it is hard to recompute from the current state: in the &gt;&lt;former ablation, training a projection layer (a learnable matrix mapping the narrow representation back to the wide dimension) to restore dimensions when layers widen again gives a loss of 3.150, worse even than the constant-width baseline (3.138). My reading is that the only way to get shallow representations back is to go back to the source.</p>

### 1b. Why representation pump helps

<p>What the two pumps share is that deep layers bypass the accumulated sum and read shallow-layer representations directly; they differ in whose representations are read (the current token's own, or earlier tokens') and where they enter (the residual stream, or the attention K/V). Here is how they ease the three problems in 1a:</p>

<div class="post-table" tabindex="0" role="region" aria-label="Table">
<table><thead>
<tr><th><strong>Problem</strong></th><th><strong>How hidden-state pump helps</strong></th><th><strong>How KV pump helps</strong></th></tr>
</thead><tbody>
<tr><td>uniform aggregation</td><td>Gives each layer a set of cross-layer weights to retrieve the outputs of chosen layers</td><td>Uses weights to choose which layers' V or K/V to mix in</td></tr>
<tr><td>PreNorm dilution</td><td>Layer j's share of the input is set by the weights, no longer by norm ratios</td><td>Shallow V no longer has to survive the residual stream to reach deep layers; it enters deep attention directly</td></tr>
<tr><td>representation collapse</td><td>Retrieves shallow representations from before repeated averaging by attention</td><td>Mixes in shallow V that has been averaged only a few times, restoring token-level information</td></tr>
</tbody></table>
</div>

<p>What matters is indeed shallow-layer information, not just extra parameters or a different structure:</p>

<ul>
<li>In the &gt;&lt;former ablation, there are two ways to fill in dimensions when layers widen again: zero padding (new coordinates set to 0) and carry-forward (copy each coordinate unchanged from the last layer that processed it). The two have exactly the same shape and differ only in whether shallow-layer values are kept: loss 3.124 vs 3.099.</li>
<li>AttnRes (retrieves earlier layers' outputs with attention, see 2a): training analysis on a 48B model shows it eases PreNorm dilution: output magnitudes stay bounded along depth and gradient norms are spread more evenly across layers.</li>
<li>LIMe (each attention head takes K/V from all earlier layers, see 3b) keeps higher value entropy in deep layers (the matrix entropy of the value matrix), and deep-layer values are also more linearly separable (easier for a linear classifier to tell different tokens apart).</li>
<li>ResFormer (adds the first layer's V to every later layer, see 3a) reaches the same validation loss with 16.11% fewer parameters or 20.3% less training data on 82M–468M models.</li>
</ul>

### 1c. Three kinds of cross-layer weights

<p>Almost every pump can be written in the same form: the current layer ℓ issues a query, the earlier layers' outputs v_0, …, v_{ℓ−1} provide keys and values, and the current layer reads:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-13.png" alt="h_ℓ = Σ_{j&lt;ℓ} α_{j→ℓ} v_j" width="110" height="43" loading="lazy" decoding="async"></div>

<p>Methods differ only in how the weights α_{j→ℓ} are obtained. Looking at where the query and the key come from gives three types:</p>

<div class="post-table" tabindex="0" role="region" aria-label="Table">
<table><thead>
<tr><th><strong>Weight type</strong></th><th><strong>query</strong></th><th><strong>key of layer j</strong></th><th><strong>Input-dependent weights</strong></th><th><strong>Looks at what layer j contains</strong></th><th><strong>Examples</strong></th></tr>
</thead><tbody>
<tr><td>static</td><td>none</td><td>none (a learned constant)</td><td>no</td><td>no</td><td>DenseFormer, ResFormer, LIMe's static router, FusedKV</td></tr>
<tr><td>router-like</td><td>the current token's state</td><td>learned parameters, one fixed "slot" per source layer</td><td>yes</td><td>no</td><td>MUDD, M3Former, LIMe's dynamic router, DAGFormer</td></tr>
<tr><td>attention-like</td><td>static or input-dependent</td><td>computed from layer j's own output</td><td>yes</td><td>yes</td><td>AttnRes, MSAR, Depth-Attention</td></tr>
</tbody></table>
</div>

<p>The structures in the "Examples" column are introduced in Section 2 (hidden-state pump) and Section 3 (KV pump).</p>

<ul>
<li><strong>static</strong>: α_{j→ℓ} is a constant learned in training, the same for all tokens. MUDD calls this static dense connections; LIMe calls it a static router.</li>
<li><strong>router-like</strong>: similar to the router in MoE (mixture of experts), which scores each expert from the current token; here the current token's state passes through a small network that outputs one weight per source layer (MUDD's form is below). The weights vary with the token but do not look at what the earlier layers contain: dimension j of the output always corresponds to layer j. Unlike MoE, there is no top-k (keeping only the k highest scores); all source layers take part in the weighting.</li>
<li><strong>attention-like</strong>: the query is matched against a key for each earlier layer with softmax, and the key comes from that layer's own output (AttnRes's form is below). AttnRes describes its approach as content-dependent selection via softmax attention.</li>
</ul>

<p>MUDD's (router-like) cross-layer weights are given below: X_ℓ is the input of layer ℓ; it is normalized with RMSNorm, passed through a two-layer small network (weights W_1 and W_2, activation GELU), and a static bias a_ℓ is added; dimension j of the output A_ℓ is the weight of layer j.</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-14.png" alt="A_ℓ = GELU(RMSNorm(X_ℓ) W_1) W_2 + a_ℓ" width="275" height="28" loading="lazy" decoding="async"></div>

<p>AttnRes's (attention-like) cross-layer weights are given below: w_ℓ is the pseudo-query learned for layer ℓ (a vector that does not depend on the input), each earlier layer's output v_j acts as a key after RMSNorm, and softmax_j denotes softmax over all earlier layers j.</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-15.png" alt="α_{j→ℓ} = softmax_j(w_ℓᵀ RMSNorm(v_j))" width="246" height="31" loading="lazy" decoding="async"></div>

<p>Dynamic does not mean attention-like: in router-like weights the query depends on the input while the keys are fixed; AttnRes's default pseudo-query is static, but its keys come from each layer's output, so it is attention-like.</p>

## 2. hidden-state pump

<p>A hidden-state pump sends shallow-layer representations into the residual stream as input to deep layers. Four main structures take four different routes:</p>

<ul>
<li><strong>AttnRes</strong>: keeps every layer's output and lets deep layers retrieve them by content with attention.</li>
<li><strong>mHC</strong>: expands the residual stream into several streams so more information is carried along depth.</li>
<li><strong>&gt;&lt;former</strong>: lets part of the coordinates (the dimension components of the residual-stream vector) bypass narrow layers unchanged, so deep layers get them back as they were.</li>
<li><strong>Gated Residual</strong>: also expands the residual stream into several streams, but drops cross-stream mixing and only uses gates to decide how much to read from and write back to each stream.</li>
</ul>

### 2a. AttnRes: keep every layer's output and retrieve with attention

<figure>
<img src="/assets/posts/representation-pump/attention-residual-architectures.png" alt="Residual, Full AttnRes, and Block AttnRes architectures." width="615" height="347" loading="lazy" decoding="async">
<figcaption>Source: Kimi Team, <em>Attention Residuals</em>, arXiv:2603.15031 (2026), Figure 1. (a) Standard residuals, equal-weight sum; (b) Full AttnRes, each layer selectively aggregates all earlier layers' outputs with learned attention weights; (c) Block AttnRes, layers are grouped into blocks and memory drops from O(Ld) to O(Nd).</figcaption>
</figure>

<ul>
<li><strong>Method</strong>: each layer has a learned pseudo-query (a query vector that does not depend on the input); the outputs of all earlier layers (including the embedding) serve as keys and values, and their softmax-weighted sum is the layer's input. This is Full AttnRes. Block AttnRes splits the L layers into N blocks and keeps only block-level representations, cutting memory from O(Ld) to O(Nd) (d is the hidden dimension).</li>
<li><strong>Weights</strong>: attention-like.</li>
<li><strong>Results</strong>: a scaling-law fit for Block AttnRes shows a 1.25× compute advantage, i.e. the baseline needs 25% more compute to reach the same loss (see the figure below). On Kimi Linear 48B (MoE, 3B parameters activated per token) trained on 1.4T tokens, GPQA-Diamond (a graduate-level science QA benchmark) goes from 36.9 to 44.4 (+7.5). Kimi K3 (2.8T) adopts the Block version.</li>
</ul>

<figure>
<img src="/assets/posts/representation-pump/attention-residual-scaling.png" alt="Loss versus training compute for the baseline, Full AttnRes, and Block AttnRes." width="383" height="348" loading="lazy" decoding="async">
<figcaption>Source: Kimi Team, <em>Attention Residuals</em>, arXiv:2603.15031 (2026), Figure 4. The x-axis is training compute (PFLOP/s-days) and the y-axis is loss; the three dashed lines are scaling-law fits for the baseline, Full AttnRes and Block AttnRes, and the arrow marks the 1.25× compute advantage.</figcaption>
</figure>

### 2b. mHC: expand the residual stream into several streams

<figure>
<img src="/assets/posts/representation-pump/hyper-connections.png" alt="Residual connections, hyper-connections, and manifold-constrained hyper-connections." width="651" height="340" loading="lazy" decoding="async">
<figcaption>Source: Xie et al. (DeepSeek), <em>mHC: Manifold-Constrained Hyper-Connections</em>, arXiv:2512.24880, Figure 1. (a) Standard residual: x_l passes through layer F and is added back; (b) HC: x_l is expanded into several streams, and three mappings, Res, Pre and Post (H_res, H_pre and H_post in the text), mix the streams, read the layer input and write the layer output back; (c) mHC: all three mappings are projected (P) onto their own constraint sets, and the constraint set for H_res is the doubly stochastic matrices.</figcaption>
</figure>

<ul>
<li><strong>Method</strong>: following Hyper-Connections (HC, Zhu et al., 2025), the residual stream is expanded into n streams; each layer reads the sublayer input with H_pre (read weights from the n streams to the sublayer input), writes back with H_post (write weights from the sublayer output to the n streams), and mixes the streams with H_res (an n×n cross-stream mixing matrix). Unconstrained HC shows loss spikes when training a 27B model; mHC uses Sinkhorn iterations (alternating row and column normalization) to project H_res onto a doubly stochastic matrix (every row and column non-negative and summing to 1), and the largest amplification of the signal by the product of H_res across layers drops from nearly 3000 to about 1.6.</li>
<li><strong>Weights</strong>: generated dynamically from the current state, plus a learnable static bias.</li>
<li><strong>Results</strong>: at 27B the final loss is 0.021 below the baseline, and BBH (BIG-Bench Hard, a set of difficult reasoning tasks) goes from 43.8 to 51.0. DeepSeek-V4 and GLM-5.3-Flash adopt it; Qwen3.8-Flash-Next uses Gated Residual, a variant without H_res (2d).</li>
</ul>

### 2c. ><former: let part of the coordinates bypass narrow layers

<figure>
<img src="/assets/posts/representation-pump/variable-width-transformer.png" alt="Schematic of the variable-width Transformer." width="206" height="264" loading="lazy" decoding="async">
<figcaption>Source: Wu et al., <em>Variable-Width Transformers</em>, arXiv:2606.18246 (2026), Figure 1. The model is wide at both ends and narrow in the middle; the dashed arrows show part of the coordinates bypassing the narrow middle layers and being picked up unchanged when the layers widen again.</figcaption>
</figure>

<ul>
<li><strong>Method</strong>: the model is x-shaped, wide at both ends and narrow in the middle; the residual stream is as wide as the widest layer. Narrow layers read and write only the leading coordinates (dimension components) of the residual-stream vector, and the remaining coordinates bypass the layer (skip it with their values unchanged); when layers widen again, carry-forward copies each coordinate unchanged from the last layer that processed it.</li>
<li><strong>Weights</strong>: static, fixed by the architecture.</li>
<li><strong>Results</strong>: at 2B scale, it reaches the loss of the constant-width baseline (a standard Transformer whose layers all have the same width) with only 77.8% of the FLOPs; at the same loss the KV cache is 14.9% smaller (the KV cache stores the keys/values of processed tokens at inference, and its size is proportional to the average layer width; both numbers are scaling-law estimates, see the figure below). The 500M ablation (Table 4) compares ways of filling in dimensions when layers widen again: carry-forward 3.099, zero padding (new coordinates set to 0) 3.124, a trained projection layer (a learnable matrix mapping back to the wide dimension) 3.150, against 3.138 for the constant-width baseline; with the same shape, keeping shallow-layer values is better. I have not found any open-source model that adopts it.</li>
</ul>

<figure>
<img src="/assets/posts/representation-pump/variable-width-scaling.png" alt="Loss versus training FLOPs and versus average layer width." width="651" height="304" loading="lazy" decoding="async">
<figcaption>Source: Wu, Sieberling, Tan, Panda, Polyanskiy, Kim, <em>Variable-Width Transformers</em>, arXiv:2606.18246 (2026), Figure 4. Left: loss vs training FLOPs; right: loss vs average layer width (proportional to the KV cache).</figcaption>
</figure>

### 2d. Gated Residual: drop cross-stream mixing and read/write only through gates

<figure>
<img src="/assets/posts/representation-pump/gated-residual.png" alt="Gated Residual architecture with gated reads and writes." width="349" height="348" loading="lazy" decoding="async">
<figcaption>Source: Qwen Team, <em>On the Design of Qwen3.8-Next Architecture</em>, arXiv:2608.30320, Figure 1. The model stacks 3 GDN layers (Gated DeltaNet, a form of linear attention) and 1 QSA layer (Qwen Sparse Attention) in alternation. Every sublayer (attention or MoE) first reads its input from the widened residual stream (the four circles, i.e. 4 streams) through GR Read and then writes its output back through GR Write; the prediction head and the MTP modules (auxiliary modules that predict several following tokens) are also preceded by a GR Read.</figcaption>
</figure>

<p>Let the residual stream be expanded into n_r = 4 streams R_1, …, R_{n_r}. Each sublayer (attention or MLP) first applies RMSNorm to each stream separately (γ_i is stream i's own gain), then concatenates the normalized streams into one long vector (vec below) and computes two sets of gates from it: the read gate G goes down to d/8 dimensions through W_d, through a SiLU activation, back up through W_u and through a sigmoid (σ), giving every channel of every stream a value between 0 and 1; the write gate s goes through W_w and 2σ, giving each stream a scalar between 0 and 2. The sublayer input x is the average of the gated streams, and the sublayer output y is added back to each stream scaled by s_i (⊙ is element-wise multiplication):</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-16.png" alt="R̂_i = RMSNorm(R_i; γ_i), G = σ(W_u SiLU((1/n_r) W_d vec(R̂))), s = 2σ((1/n_r) W_w vec(R̂)); x = (1/n_r) Σ_{i=1}^{n_r} G_i ⊙ R̂_i, y = F(x), R′_i = R_i + s_i y" width="586" height="84" loading="lazy" decoding="async"></div>

<ul>
<li><strong>Method</strong>: like mHC it expands the residual stream into several streams, but it drops the cross-stream mixing matrix H_res, so each block reads the full residual state one time fewer. The per-stream RMSNorm in the read replaces the block's original pre-norm, so widening adds no normalization layer.</li>
<li><strong>Weights</strong>: generated dynamically from the current streams; the read gate is per stream and per channel, and the write gate is one scalar per stream. The paper finds that adding a static term brings no gain.</li>
<li><strong>Results</strong>: on 25B-A3B (an MoE with 25B total parameters and 3B activated per token) trained on 560B tokens, loss drops from 1.617 with a single residual stream to 1.590 and the benchmark average goes from 50.91 to 54.66, on par with dynamic mHC (1.594, 54.47); on a 28-layer model it ties Full AttnRes (1.762). In stress tests with 3–4× the learning rate, it shows fewer loss spikes and gradient-norm spikes. Qwen3.8-Flash-Next (a preview of the Qwen4 architecture) adopts it.</li>
</ul>

### 2e. Other hidden-state pumps

<ul>
<li><strong>DenseFormer</strong>: after each block, takes a weighted average of all earlier representations, with learned scalar weights (static).</li>
<li><strong>MUDD</strong> (MUDDFormer): weights generated from the current state (router-like), with a separate set of cross-layer mixing weights for each of the four paths Q, K, V and the residual.</li>
<li><strong>DCA</strong> (DeepCrossAttention): weights are determined by each source layer's own output, similar in form to AttnRes but without softmax; three separate mixtures serve as the inputs to Q, K and V.</li>
<li><strong>MSAR</strong> (Multi-Stream Attention Residuals): a multi-head generalization of AttnRes (several queries retrieve separately, as in multi-head attention), with a 1.58× compute speedup at equal loss (1.35× for AttnRes and 1.30× for mHC in the same paper).</li>
<li><strong>M3Former</strong>: fine-grained cross-layer mixing, with weights generated from the current state (router-like).</li>
<li><strong>DAGFormer</strong>: uses a predictor to generate layer-to-layer connection weights for each token (router-like).</li>
</ul>

## 3. KV pump

<p>A KV pump sends shallow-layer representations into attention: besides the current layer's own K/V, deep-layer attention also reads shallow-layer representations. Four main structures take four different routes:</p>

<ul>
<li><strong>ResFormer</strong>: adds the first layer's V to the V of every later layer.</li>
<li><strong>LIMe</strong>: computes each head's K/V from a combination of all earlier layers' outputs.</li>
<li><strong>Depth-Attention</strong>: scores earlier layers with the current layer's query and mixes their V into the current layer's V.</li>
<li><strong>FusedKV</strong>: layers in the upper half no longer compute their own K/V; instead they fuse the K/V of layer 1 and layer n.</li>
</ul>

### 3a. ResFormer: add the first layer's V to every layer

<figure>
<img src="/assets/posts/representation-pump/value-residual-learning.png" alt="Value residual connections in ResFormer and the corresponding attention diagram." width="283" height="348" loading="lazy" decoding="async">
<figcaption>Source: Zhou et al., <em>Value Residual Learning</em>, arXiv:2410.17897, panels (c) and (d) of Figure 1. A is the attention weight matrix, V the value, H the layer's attention output, and superscripts are layer indices. (c) DenseFormer weights across the outputs H of different layers (hidden-state pump); (d) ResFormer adds the first layer's V¹ to the V of every later layer (KV pump).</figcaption>
</figure>

<p>The value of layer n becomes the expression below, where V_1 is the first layer's value, H_{n−1} is the input of layer n (the output of layer n−1), W_n^V is layer n's value projection matrix, and λ_{n,1}, λ_{n,2} are mixing coefficients:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-17.png" alt="V_n = λ_{n,1} V_1 + λ_{n,2} H_{n−1} W_n^V" width="185" height="31" loading="lazy" decoding="async"></div>

<ul>
<li><strong>Method</strong>: add the first layer's value to the current layer's value (see the equation above). In the paper's ablation, only the connection from the first layer gives a significant gain.</li>
<li><strong>Weights</strong>: static; λ is a constant or a learnable scalar.</li>
<li><strong>Results</strong>: on 82M–468M models, it reaches the same validation loss with 16.11% fewer parameters or 20.3% less training data.</li>
</ul>

### 3b. LIMe: each head takes K/V from all earlier layers

<figure>
<img src="/assets/posts/representation-pump/lime-architecture.png" alt="LIMe heads construct keys and values from earlier layers." width="651" height="326" loading="lazy" decoding="async">
<figcaption>Schematic: the paper has no architecture figure, so this figure is drawn from the equations in Section 4 of Gerasimov et al., <em>You Do Not Fully Utilize Transformer's Representation Capacity</em>, arXiv:2502.09245. Each head mixes the outputs X_m of all earlier layers (X_0 is the embedding) with its own softmax weights α to get Z_h, which then goes through this head's K/V projection in the current layer; the query is still computed from X_{r−1}. Bar lengths only illustrate that different heads draw on different layers; they are not the paper's actual weights.</figcaption>
</figure>

<p>The K/V of head h in layer r are computed as below, where X_m is the output of layer m (X_0 is the embedding), α_{h,m} is this head's softmax weight on layer m, and W_h^K and W_h^V are this head's key/value projection matrices in the current layer:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-18.png" alt="Z_h = Σ_{m=0}^{r−1} α_{h,m} X_m, K_h = Z_h W_h^K, V_h = Z_h W_h^V" width="354" height="57" loading="lazy" decoding="async"></div>

<ul>
<li><strong>Method</strong>: every head in every layer has a router (a small module that scores each source layer), which gives a set of softmax weights over the outputs of all earlier layers; the convex combination then goes through the current layer's K/V projection to give this head's K and V. The query is unchanged.</li>
<li><strong>Weights</strong>: the router can be token-independent (static) or generated from the previous layer's output (router-like).</li>
<li><strong>Results</strong>: at about 1.2B parameters and 50B tokens, the 1-shot average accuracy (average accuracy over several benchmarks with one example per question) is 58.4, vs 57.7 for a LLaMA-architecture baseline of the same size; the advantage grows with depth (32, 64 and 128 layers). Router analysis shows that deep layers turn markedly toward earlier layers.</li>
</ul>

<figure>
<img src="/assets/posts/representation-pump/lime-value-representations.png" alt="t-SNE plots of value representations for is, are, were, and was across layers." width="651" height="306" loading="lazy" decoding="async">
<figcaption>Source: Gerasimov et al., <em>You Do Not Fully Utilize Transformer's Representation Capacity</em>, arXiv:2502.09245, Figure 6. t-SNE (a method for visualizing high-dimensional vectors in two dimensions) of the value vectors of four similar tokens, is / are / were / was, across layers: in LLaMA the four classes are already mixed from layer 7 on, while in LIMe they are still separable at layer 16.</figcaption>
</figure>

### 3c. Depth-Attention: mix earlier layers' V into V

<figure>
<img src="/assets/posts/representation-pump/depth-attention.png" alt="Depth-Attention compared with other attention designs." width="597" height="347" loading="lazy" decoding="async">
<figcaption>Source: Zeng et al., <em>Depth-Attention: Cross-Layer Value Mixing for Language Models</em>, arXiv:2606.05014, Figure 1. Top left: ordinary self-attention mixes information along the sequence. Bottom left: Depth-Attention works along depth, scoring the keys of layers 0, s, 2s, … with the current layer's query (s is the layer stride) and mixing the corresponding values into ṽ; in the complexity O(TL/s), T is the sequence length and L the number of layers. Middle: the mixed Ṽ goes into causal self-attention together with the current layer's original Q and K.</figcaption>
</figure>

<ul>
<li><strong>Method</strong>: before self-attention, for the same token, the current layer's query does a softmax over the keys of the current layer and some earlier layers, the corresponding values are mixed with these weights, and self-attention then runs as usual with the original Q and K.</li>
<li><strong>Weights</strong>: attention-like.</li>
<li><strong>Results</strong>: perplexity (the exponential of the average cross-entropy loss; lower is better) goes from 8.17 to 7.77 at 1.5B and from 7.55 to 7.25 at 3B. In the same table it beats DenseFormer, AttnRes and mHC, but its edge over AttnRes at 3B is small (7.25 vs 7.27). In the ablation, mixing only V works best, and mixing only K brings no gain.</li>
</ul>

### 3d. FusedKV: rebuild the upper half's K/V from layers 1 and n

<figure>
<img src="/assets/posts/representation-pump/fused-kv.png" alt="The attention and key/value sharing patterns in the FusedKV comparison." width="641" height="348" loading="lazy" decoding="async">
<figcaption>Source: Lin et al., <em>Reconstructing KV Caches with Cross-layer Fusion For Enhanced Transformers</em>, arXiv:2512.03870 (ICLR 2026). (a) Vanilla: every layer computes its own K/V; (b) FusedKV-Lite: layers in the upper half directly reuse layer n's K and layer 1's V; (c) FusedKV: the K and V of layers in the upper half are fused from the K and V of layers 1 and n with learnable weights (⊗).</figcaption>
</figure>

<p>Suppose the model has 2n layers: layers 1 to n compute and cache their own K/V as usual, while layers n+1 to 2n no longer compute K/V and instead fuse the K/V of layer 1 (the shallowest) and layer n (the middle layer). In the equation below, w is a learnable weight vector of layer i (the superscript marks which layer's K or V it acts on), and ⊙ denotes element-wise multiplication:</p>

<div class="post-equation"><img src="/assets/posts/representation-pump/equation-19.png" alt="K_i = w_i^{K,1} ⊙ K_1 + w_i^{K,n} ⊙ K_n, V_i = w_i^{V,1} ⊙ V_1 + w_i^{V,n} ⊙ V_n, i = n + 1, …, 2n" width="558" height="32" loading="lazy" decoding="async"></div>

<ul>
<li><strong>Method</strong>: the paper's analysis finds that high-layer values come mainly from the bottom layer, while high-layer keys come from both the bottom and middle layers, so it rebuilds the upper half's K/V from the K/V of layers 1 and n. The fusion acts on keys after RoPE (rotary position embedding), so no position encoding needs to be re-applied after fusion. FusedKV-Lite does no weighting and simply lets the upper half reuse layer n's K and layer 1's V.</li>
<li><strong>Weights</strong>: static; the fusion weights are learnable per-channel vectors that do not depend on the token.</li>
<li><strong>Results</strong>: both the KV cache and prefill latency are roughly halved. Validation loss (lower is better; the first number is the standard Transformer) is 2.651 → 2.642 at 332M, 2.483 → 2.474 at 650M, 2.241 → 2.221 at 1.5B and 2.002 → 1.978 at 4B; YOCO and CLA, which also save KV cache, reach 2.244 and 2.258 at 1.5B, worse than the standard Transformer. At 1.5B, FusedKV converges about 1.26× faster than the standard Transformer.</li>
</ul>

## 4. What frontier models chose

<div class="post-table" tabindex="0" role="region" aria-label="Table">
<table><thead>
<tr><th><strong>Model</strong></th><th><strong>Design</strong></th><th><strong>pump</strong></th><th><strong>Weight source</strong></th><th><strong>Purpose</strong></th></tr>
</thead><tbody>
<tr><td>Kimi K3 (2.8T, 2026-07)</td><td>Block AttnRes</td><td>hidden</td><td>attention-like (static pseudo-query)</td><td>quality</td></tr>
<tr><td>DeepSeek-V4</td><td>mHC, several parallel residual streams</td><td>hidden, residual stream expansion</td><td>dynamic, generated from the current state</td><td>quality, stability</td></tr>
<tr><td>GLM-5.3-Flash (320B-A18B, i.e. 320B total parameters, 18B activated per token)</td><td>DeepSeek-V4-style mHC, 4 streams</td><td>hidden, residual stream expansion</td><td>dynamic, generated from the current state</td><td>quality</td></tr>
<tr><td>Qwen3.8-Flash-Next (125B-A6B, 2026-08, Qwen4 architecture preview)</td><td>Gated Residual: residual stream expanded into 4 streams, an element-wise read gate plus one scalar write gate per stream; no cross-stream mixing matrix</td><td>hidden, residual stream expansion</td><td>dynamic, generated from the current state</td><td>quality, training stability</td></tr>
</tbody></table>
</div>

<p><strong>Why only hidden-state pumps?</strong> At least so far, frontier open models all use hidden-state pumps; I have found none that adopts a KV pump, and no lab has publicly explained why. I see two main reasons:</p>

<ul>
<li><strong>Conflict with MLA's inference optimization</strong> (my analysis): MLA (Multi-head Latent Attention, introduced in DeepSeek-V2) compresses K/V into a low-dimensional latent vector before caching; at inference, V's up-projection matrix (latent to V) can be multiplied into the output projection matrix ahead of time to form a single matrix (called absorption), so V is never computed explicitly. ResFormer and Depth-Attention mix V across layers after the projection; on MLA, one would either have to compute V explicitly or read another layer's (e.g. the first layer's) latent cache at every layer during decoding, which adds exactly the memory traffic MLA is designed to save.</li>
<li><strong>It changes the inside of attention and is harder to maintain</strong>: a hidden-state pump only changes the residual path between blocks; Qwen fuses the read and the write of Gated Residual into one kernel each and stores the residual state in FP8 (8-bit floating point) to cut memory traffic. A KV pump changes what attention reads, which touches the attention kernel and the KV cache layout; the Depth-Attention paper also lists "not fused into the attention kernel" as a limitation.</li>
</ul>

## 5. A warning from Mistral Large 4 training: BPB alone is not enough

<p>The controlled experiments cited in this post look only at pretraining BPB (bits per byte, a metric equivalent to loss) or perplexity; none of them looks at agentic performance (calling tools over many steps to complete tasks on its own) after mid-training (continued training late in pretraining) or SFT (supervised fine-tuning).</p>

<p>Mistral Large 4 is a counterexample. It initially used a sliding window (each token attends only to the most recent 512 tokens), CLA (adjacent layers share one KV) and YOCO (all layers in the second half share the middle layer's KV), shrinking the KV cache to 1/16 of full attention, and pretraining evaluations found no problems; only after SFT did long-context agentic tasks get clearly worse. After mid-training, architectures with similar perplexity scored differently on SWE-bench Verified (a code benchmark of fixing real GitHub issues), while MMLU Redux (multiple-choice questions across many subjects) tracked perplexity closely. Mistral eventually removed the sliding window and CLA and switched to agentic evaluations to guide architecture decisions. (Details are from alphaXiv's summary of the Mistral report.)</p>

<p>Like pumps, CLA and YOCO are architectural changes to how K/V flow between layers. So when evaluating pumps, beyond BPB, each variant should go through the same mid-training or SFT under the same compute, and then be compared on downstream agentic tasks; Mistral also notes that longer training may narrow this gap, which still needs to be confirmed by experiments.</p>

## 6. Conclusion

<ul>
<li><strong>hidden-state pump</strong>: sends shallow-layer representations into the residual stream as input to deep layers. AttnRes keeps every layer's output and retrieves it with attention, mHC expands the residual stream into several streams, &gt;&lt;former lets part of the coordinates bypass narrow layers, and Gated Residual drops cross-stream mixing and reads/writes only through gates; all four bring sizeable training gains.</li>
<li><strong>KV pump</strong>: sends shallow-layer representations into attention, so that beyond the current layer's V, attention also reads shallow-layer representations, as in ResFormer, LIMe, Depth-Attention and FusedKV; all validation so far is at 4B or below.</li>
<li><strong>Frontier models use only hidden-state pumps</strong>: KV pumps conflict with MLA's inference optimization and require changes inside attention, which puts higher demands on infra.</li>
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
