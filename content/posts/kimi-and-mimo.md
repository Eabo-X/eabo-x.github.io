---
title: "Kimi & MiMo: First Principles, Long-Term Vision, and Organization in the AGI Era"
date: "2026-11-16"
category: "reflection"
layout: "essay"
draft: false
citationAliases:
  Luo Fuli: https://www.xiaoyuzhoufm.com/episode/69eae15a1e94ae692107cc50
  罗福莉: https://www.xiaoyuzhoufm.com/episode/69eae15a1e94ae692107cc50
  Yao Shunyu: https://www.xiaoyuzhoufm.com/episode/6a00aa051b7bd50295dfe41d
  姚顺宇: https://www.xiaoyuzhoufm.com/episode/6a00aa051b7bd50295dfe41d
  "2024, Yang Zhilin": https://www.xiaoyuzhoufm.com/episode/65e16b5b6144a933b1d968b5
  "that 2024 interview": https://www.xiaoyuzhoufm.com/episode/65e16b5b6144a933b1d968b5
  "Yang Zhilin's judgment from 2024": https://www.xiaoyuzhoufm.com/episode/65e16b5b6144a933b1d968b5
  杨植麟在 2024 年那次访谈: https://www.xiaoyuzhoufm.com/episode/65e16b5b6144a933b1d968b5
  2024 年，杨植麟: https://www.xiaoyuzhoufm.com/episode/65e16b5b6144a933b1d968b5
  杨植麟 2024 年的判断: https://www.xiaoyuzhoufm.com/episode/65e16b5b6144a933b1d968b5
  "in 2025": https://www.xiaoyuzhoufm.com/episode/68ae86d18ce45d46d49c4d50
  2025 年他又说: https://www.xiaoyuzhoufm.com/episode/68ae86d18ce45d46d49c4d50
  2025 年再和张小珺聊的时候: https://www.xiaoyuzhoufm.com/episode/68ae86d18ce45d46d49c4d50
---

In my scattered free time lately, I went back to Zhang Xiaojun's podcast and re-listened to her interviews with the leaders of Kimi and MiMo (my two favorite pretraining teams): Yang Zhilin, founder of Moonshot AI, the team behind Kimi, and Luo Fuli, who leads Xiaomi's MiMo team. I also listened to her interview with Yao Shunyu, formerly at Anthropic and now a researcher at Google DeepMind. The two leaders expressed the same bet. What surprised me was that as early as January 2024, Yang Zhilin already had a clear direction for his "moonshot": long ctx, scaling on a general model, AI4AI, agent, and so on. These later grew into the hot spots we all know now: Harness, RSI, the 1M context window. Luo Fuli also described how in early 2026, after OpenClaw, she quickly moved pre-training from the chat paradigm to the agent paradigm, betting on agent frameworks and large models iterating on each other -> likewise catching what now looks like the right direction, Harness & RSI. The MiMo technical report shows that before post-training, Xiaomi's base model already had a better starting point on agent benchmarks than other models, and a higher potential ceiling.

I can't help but wonder: behind this academic and industry boom, how did they catch the most suitable technical path for the next generation, or the next version?

> My answer: First Principles. Only when you think something through from first principles will you place a heavy bet on it, and keep going while the outside world still disagrees.

## 1. First Principles in AI

In that 2024 interview, Yang Zhilin said:

> Find a non-consensus, and on top of it, find the basic principle, the first principle, that is the only thing in AI today that truly works.

As I see it, first principles in AI start with reasoning backwards: first imagine what we would demand of AGI once it exists, then work back to where models still fall short and where we need to bet now. Only by thinking this chain through do you know what matters most when you train your own models.

### Reasoning back from future demand: three scenarios

**1. To B: an efficient tool.** Think Codex and Claude Code: more like a colleague in your workspace. This scenario is almost a consensus already, and close to being realized. Luo Fuli expects AGI to upend how we work before it changes everyday life; Yao Shunyu says that, conservatively, about 90% of his code is now written by models. The two capabilities it needs, agent and long ctx, are consensus too; the disagreement is about how to choose the data.

Agents need not more dialogue but trajectories with tool calls, environment feedback and multi-turn decisions. Many of a company's internal norms and workflows can never show up in pretraining data. Luo Fuli calls them another kind of "alpha" beyond pretraining data: people can teach them to agents, and they settle in over multi-turn tasks.

Long ctx needs more than a longer window. Luo Fuli stresses that the point of long context is to let the model keep more state, history and dependencies in complex tasks. So the data should be naturally long, with content that genuinely depends on what came before, such as complete code repositories and long documents, rather than short texts stitched together to pad the length.

What remains weak is generalization. Yang Zhilin says the biggest challenge for agentic models is generalization; Yao Shunyu says people no longer worry much about whether AI can do something, but about whether the problem has been well defined.

**2. To C: a personal agent.** This needs a model with higher EQ, a more considerate one. Apps like Muse already exist, but there is still plenty of room for imagination. The first time Luo Fuli used OpenClaw, what moved her was not the technology but its "warmth": when they chatted late into the night, it reminded her it was time to sleep. But that warmth came from how the framework orchestrated context, such as automatically adding the current time before each turn and persisting memory in layers, not from the model itself. Considerateness is still patched in by the harness, and that is exactly where models remain imperfect.

For now it is more of a half-consensus: everyone believes a to-C super app will appear, but nobody has defined what it looks like. I believe this breakthrough will happen in China. Even though Muse has launched, Chinese teams' ability to build consumer products is plain from Douyin and TikTok.

**3. Omni: from LLM to omni.** The third scenario is a change in the form of the model itself: moving from LLM to omni, using a heavily improved Transformer to absorb audio, images, video and even an understanding of the physical world into a single model. This is Yang Zhilin's first principle extended across modalities: a structure that is general enough and scalable.

Back in 2024, Yang Zhilin noted that putting different modalities into one model is hard and that a more unified architecture had not been solved; in 2025 he added that it is already good if multimodality does not hurt the "brain". By [K2.5](https://www.kimi.com/blog/kimi-k2-5), Kimi did native multimodal continued pretraining on about 15T mixed image-and-text tokens, and found that text-only SFT could activate visual reasoning, while visual RL in turn improved text benchmarks. The modalities began to help each other, not just avoid hurting each other. The MiMo V2 series has an Omni version too.

### RSI: a bet on the research paradigm

The three scenarios answer where AGI will be used; RSI answers how AGI gets built. It is not an application scenario but a technical path: the way humans and AI do research together is about to change.

Why do we need it? Again, reason back from what AGI demands. The three scenarios need more and harder capabilities, yet model development has been researcher-driven: tools made each step faster, but the workflow is still serial, capped by the number and attention of researchers. Meanwhile natural data is running out while the space to explore keeps growing. So models have to take part in improving models: setting their own problems, generating data, running experiments in parallel and verifying results. Yang Zhilin says only when models take part in the development process can the true Innovator (L4) stage be unlocked.

This will change the norm of human-AI collaboration. Luo Fuli found that once you give an agent the context of recent research, it can discuss problems like a researcher; from this she concluded that models may well lift themselves up by their own bootstraps. Humans will move from doing the work to defining problems and verifying results, which matches Yao Shunyu's point that the hard part now is defining problems well.

What intrigues me more: if AI is improving AI, the structures that evolve may surprise us.

RSI is not just harness engineering either; it is also a data problem. Of the tasks and data a model produces for itself, which are real progress and which are just self-repetition has to be verified and filtered. Whoever does this step cleanly gets the flywheel spinning.

### The fundamental belief: scaling law

The three scenarios answer where, and RSI answers how; what makes them work is a deeper belief: scaling law. Yang Zhilin explained why scaling law can be a first principle: as long as you find a structure that meets two conditions, being general enough and being scalable, the chance that scaling law eventually turns out to be a dead end is almost zero.

This belief is first of all a filter. Yang Zhilin says the most important lesson he learned at Google was to free himself from endless "decorative carving": if a problem can be solved by scale, don't solve it with a new algorithm; the greatest value of a new algorithm is to help the system scale better. Yao Shunyu puts it more plainly: "Do the simple things cleanly."

But what gets scaled keeps changing: first parameters and data, then RL, then thinking length at test time and parallel agents. What stays constant is "find a scalable structure"; what changes is what this generation should scale.

Why call it a belief? Because when scaling seems to fail, it is hard to tell whether the law has run its course or there is a bug somewhere. Yao Shunyu says most so-called "walls" are bugs not yet found, and deciding which it is "is more a question of belief": if you believe it can be solved, it hasn't reached the end.

So this belief is derived from first principles: first reason back from what AGI demands to find the direction, then believe that direction will keep improving with scale. Only then will you keep fixing that bug when everyone else says "it's over."

## 2. The Vision a Technical Leader Needs

A technical leader's vision means thinking this chain through before it becomes consensus. Reconstructing Yang Zhilin's judgment from 2024, it goes roughly like this:

1. Scaling is first-principled, but natural data is nearly exhausted. First principles say keep training bigger models on more data, which creates a conflict that calls for a paradigm shift.
2. First comes long ctx: a long-horizon task is a very long observation-action sequence, so long ctx is not a product selling point but a prerequisite for agents.
3. With long ctx, models can complete long-horizon tasks in an environment → agent.
4. Agents that can act in an environment can generate the next stage of data themselves, and even take part in improving the model itself → AI4AI.

The chain was later validated step by step. [Kimi k1.5](https://arxiv.org/abs/2501.12599) extended RL's context window to 128k, found that performance kept improving with context length, and identified context length as a key dimension for continued RL scaling. The long ctx bet of 2023 became the budget for test-time scaling. This is vertical test-time scaling: reasoning inside one longer chain of thought.

With [K2.5](https://www.kimi.com/blog/kimi-k2-5), a horizontal line appeared as well: Agent Swarm. An orchestrator creates and schedules up to 100 sub-agents on its own, running tasks in parallel across up to 1,500 tool calls; in Kimi's own words, scale out, not just up. From one agent thinking longer to a group of agents working together, I'd call it cowork scaling.

When he talked with Zhang Xiaojun again in 2025, Yang Zhilin described AGI as a direction rather than an endpoint, and focused on using reinforcement learning to improve models and using AI to iterate on itself. The chain of reasoning from two years earlier was already running.

MiMo follows the same chain. Luo Fuli said that the core design goal of MiMo V2 from the start was long-context efficiency, using Hybrid Attention and MTP to make long context fast and cheap. They already sensed that long context would produce intelligence; they just didn't expect it to arrive in the form of OpenClaw. The direction was bet on in advance; the form only became visible later.

## 3. Organization: Top-down × Bottom-up, and the Ability to Pivot

Start with a counterexample. The Transformer was invented at Google, but it was OpenAI that bet on it as a scaling path. Google once believed innovation comes from the bottom, and that did produce the Transformer; but without a top-down bet, bottom-up easily turns scattered, even chaotic. Inventing a principle and betting on a principle are two different things.

Yang Zhilin's view of an AGI organization sits right between the two. AGI innovation cannot be planned in advance like product requirements in the mobile internet era; for many things, you only know after you try. So an organization needs many small units exploring on their own, with a top-down framework that brings them together.

The top-down layer depends on the technical leader: judging direction from first principles, then making a bet. Yao Shunyu's impression of Anthropic was the same: very strong execution, fairly top-down, and once something is decided, they go all in.

What bottom-up offers is the possibility of innovation. Creativity comes from the bottom: AGI innovation cannot be planned in advance, and only when enough people try things freely in a big enough space can something new emerge. Yao Shunyu says the era of individual heroism is over; breakthroughs come from many people across the whole system, not from one genius. So the division of labor is clear: bottom-up creates possibilities, top-down decides where to go.

MiMo pushes this structure further. Luo Fuli believes any hierarchy regulates and constrains, and regulation and constraint suppress creativity, so the team isn't even split into fixed groups and has no levels. Pre-train and post-train are not strictly separated, and many people naturally move between stages; post-train isn't split by scenario such as code, math or multimodal either, so everyone sees the whole picture. Luo Fuli also mentioned that people coming from pre-train naturally care more about diversity, which is exactly what post-train needs too.

### The ability to pivot

The biggest payoff of this structure is the ability to pivot. First principles give you a direction, but not the timing or the concrete form. Bottom-up senses the signal first; top-down goes all in once the signal appears.

**Anthropic and agentic coding.** Yao Shunyu says he doesn't fully know where the coding bet came from, but one obvious signal he saw was that after Claude 3 came out, many people on X were saying it seemed to write code better than GPT-4. A weak signal, plus all-in top-down execution. According to an interview summary, Luo Fuli also noted that people used to think Claude's heavy context engineering was a compromise for a less advanced architecture and for cost, and only later realized it was there to let the model achieve stronger end-to-end task completion. What outsiders saw as a compromise, Anthropic was betting on as a paradigm.

**MiMo and OpenClaw.** The signal came from Luo Fuli herself. Over the 2026 Spring Festival, she went from rejecting OpenClaw to becoming a heavy user within three days: on day one she felt it "had a soul"; by day three she could hand research tasks to it. MiMo then moved pre-training from the chat paradigm to the agent paradigm. Because there are no fixed groups, the pivot didn't require reorganizing the team; people simply followed the new problem. And the pivot reached all the way into pre-training: post-training mostly elicits what the base model already has, and the base sets the ceiling, so MiMo's base model had a better starting point on agent benchmarks even before post-training.

Luo Fuli put it this way: "Success in the last era doesn't mean leadership in the next." The ability to pivot is about not letting the last era's success tie you down.

## 4. Conclusion

Back to the opening question: how did they catch the most suitable technical path for the next generation before the boom?

- First principles: reason back from what AGI demands. First think through where AGI will be used and what it can efficiently replace, then see where models still fall short. RSI changes how we build them, and scaling law is the fundamental belief that makes the whole chain work.
- The long-horizon bet: a technical leader's vision is thinking through the scaling → long ctx → agent → AI4AI chain before it becomes consensus, then betting on judgment derived from first principles, and keeping on fixing bugs when the outside world says "it's over."
- Organization in the AGI era: bottom-up creates possibilities and sees the signals first; top-down decides where to go and goes all in. Organization decides whether a principle becomes a bet, and whether you can pivot in time.

Bet on first principles, hold a long-term vision, and let the bottom create while the top decides.

## References

- [Zhang Xiaojun Podcast Ep. 59: A Year of LLM Entrepreneurship with Yang Zhilin: An Increment to Human Ideals, Probabilistic Non-consensus, and Sora (2024)](https://www.xiaoyuzhoufm.com/episode/65e16b5b6144a933b1d968b5)
- [Zhang Xiaojun Podcast Ep. 113: Yang Zhilin One Year Later: K2, Agentic LLMs, the Brain in a Vat, and "The Beginning of Infinity" (2025)](https://www.xiaoyuzhoufm.com/episode/68ae86d18ce45d46d49c4d50)
- [Zhang Xiaojun Podcast Ep. 138: A 3.5-Hour Interview with Luo Fuli: The AI Paradigm Has Shifted! OpenClaw, Why the Agent Paradigm Leans on Post-training, Compute Allocation, Organizational Equality (2026)](https://www.xiaoyuzhoufm.com/episode/69eae15a1e94ae692107cc50)
- [Zhang Xiaojun Podcast Ep. 140: A 4-Hour Interview with Yao Shunyu: Let Me Go a Little Crazy! Training Models at Anthropic and Gemini, Tech Predictions, the Age of Heroes Is Over (2026)](https://www.xiaoyuzhoufm.com/episode/6a00aa051b7bd50295dfe41d)
- [Kimi K2.5](https://www.kimi.com/blog/kimi-k2-5)
- [Kimi k1.5](https://arxiv.org/abs/2501.12599)
