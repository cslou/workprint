# Workprint — Product Strategy Litepaper

**Audience:** Internal product strategy.
**Status:** Working draft, updated 2026-10-05 to match the earlier prototype demo and the October 2026 competitor research. Demand, the first paying segment, pricing and the positioning claims in section 7 remain to be validated.

This document records long-term product intent, not supported runtime behavior, validated market demand or an implementation checklist. The [README](../README.md) describes the actual repository state; [CONTEXT.md](../CONTEXT.md) defines production terminology. The [architecture's current-MVP notice](architecture.md) and approved implementation tasks distinguish this vision from the smaller first release.

**Workprint migration note (2026-10-27):** name updated; product strategy below remains historical/aspirational. Meta Muse is the intended initial model family, subject to qualification—not automatic provider/model switching. Editor, multi-scene work, comparison/sequential playback, audio-reference/separate-audio work and automatic creative decisions described below are not first-release commitments. Human approval remains exact and explicit. Research citations identify local background documents not included in public clones; they do not establish current provider compatibility or validated customer outcomes.

## 1. Strategic direction

Enable one person to take an idea through to a finished film—a reel, a short, an episode or a feature—without needing a full production team or every specialist's experience, skills and knowledge.

Video models make shots; we make films. A good model is not enough. Getting the shot the person actually wants depends on what goes into each request: the right reference images or video, the right prompt for that model, and the right framing and continuity from the shots around it. Packaging those inputs well is extremely difficult, and so is everything around the shots: story, consistent characters, continuity, changes and editing. That is what we build.

The product is a filmmaking workspace guided by an assistant. The person describes what they want; the assistant drafts each piece of the production—script and shot breakdown, characters and places, storyboard, videos and the edit—and asks one question at a time. The person reviews, chooses and redirects.

We will focus our initial attention on short narrative films, reels and shorts, in any visual style from photographic to animated, and move on to longer-form content as we progress.

## 2. Customers

### 2.1 Customer segments

Solo creators and small-team professionals who want to make intentional narrative films, reels and shorts, are willing to take part in an iterative creative process, but lack the expertise, production capacity or budget to do it alone.

The shared qualification is wanting to shape a particular piece of work—not simply wanting any attractive video generated. Customers may start with only an idea or a brief; they should not need to arrive with a production-ready script or know how to direct every specialist task.

| Segment | Wants to |
|---|---|
| **Aspiring storyteller** | Turn a story they care about into a film. |
| **Independent creative professional** (including freelancers) | Deliver more and better work, for themselves or for clients, without hiring a bigger team. |
| **Social and short-form creator** | Grow an audience by posting story-driven reels and shorts regularly. |

**Freelancers are explicitly included.** For client work, the professional operates the product while their client reviews deliverables under their own agreement. Sharing work with a client for review is a later feature.

No segment has yet been chosen as the primary buyer. Demand, budgets, repeat use and willingness to pay remain unvalidated for all three.

### 2.2 Pain points

**Aspiring storyteller**

- Doesn't know the steps from idea to film: script, shots, storyboard, video.
- Doesn't know film-making best practice, such as which camera angles and movements suit a moment.
- Doesn't know how to get good results from the AI tools that exist.
- Can't tell why something looks wrong, or how to fix it.
- Can't afford a team, and doesn't have the skills to do it alone.

**Independent creative professional**

- Every part of the process is tedious, and there aren't enough hands to do it all.
- Adopting AI tools takes time: learning each product, then building a working system around them.
- Changes are expensive: one change can force redoing a lot of work.
- Hard to keep costs and deadlines predictable, especially on client work.

**Social and short-form creator**

- Needs a steady flow of new content, fast, and making each piece by hand is tedious.
- Adopting AI tools takes time: learning each product, then building a working system around them.
- Characters and the look have to stay recognisable from post to post.

## 3. Initial project focus

**Focus:** coherent, deliberately directed narrative work—not an isolated generated clip.

**Duration:** from reels (about 15 seconds) to short films (a few minutes). This is where we start, not a limit.

Every format is built from the same parts:

- A **shot** is one continuous piece of video. A reel can be as small as a single shot.
- A **scene** brings together shots to tell one part of the story.
- A **short film** is a batch of scenes.
- A **long film or episode** is a larger batch of scenes.

The same building blocks support every format, but editing shapes them into a film. Longer work also needs more care with pacing and continuity, so we grow from short to long.

We expect to start with short-form series creators: they publish every week, already pay for tools, and need the same characters and look across posts. Short films and episodes follow on the same structure. Which segment pays first is still to be validated.

Constraints for an initial trial:

- A small cast and few locations.
- One clear dramatic situation or compact story arc.
- An agreed visual style.
- Reviewable drafts at each step and a chance to request meaningful changes.

### Why start here

Short pieces are big enough to exercise story, several shots, continuity, review and revision, and small enough to finish and evaluate before attempting an episode or a feature. Each is a meaningful piece of work in its own right.

Duration alone doesn't define the problem. A short, specific story can need a lot of direction and continuity; a longer montage may not. Our opportunity shouldn't depend on generators being unable to make longer videos. It depends on customers needing their intent realised faithfully, and being able to inspect and change the result.

| Format | Built from | Treatment |
|---|---|---|
| Reel | One or a few shots | Initial focus |
| Short film | A batch of scenes | Initial focus |
| Episode, feature or long film | A larger batch of scenes | Next, with more editing and continuity demands |

## 4. Intended customer experience

Think Claude Code, Codex or Cursor, but for film production. The assistant is the person's single point of contact for everything the product makes. It doesn't just run the tools: it brings film-making best practice (story structure, shot choice, camera, continuity) and guides the person through the work one step at a time.

**It meets people wherever they are.** Someone can start with a one-line idea, a written story, a finished script, their own photos or an existing storyboard, and the assistant picks up from there. It works like a consultant and collaborator, not a fixed workflow or program: it adapts to what the person brings and to the help they need.

**Best practice comes ready-made.** The workflow, prompting techniques and production know-how are built in. Nobody has to learn each AI tool or build their own system around them first.

How it works:

- The person describes what they want in plain language. They don't need production vocabulary.
- The person decides how involved to be: review every decision, or let the assistant decide and only check the results. When they want a say, the assistant does the work first, says what it did, then asks one question at a time with suggested answers. The person can pick an answer, write their own, or change direction.
- Every output is one or two clicks away. The script, characters and places, storyboard and videos sit in fixed tabs beside the chat, so the person can review anything at any time. If they edit something there, the assistant picks the change up on its next turn.
- From Videos, the person can open the Editor to shape timing, picture and sound, directly or with the assistant. Both work on the same edit without overwriting the originals; export does not require an Editor visit.
- Nothing is lost. Every version is kept, so the person can compare versions, go back to an earlier one, or change one shot without redoing the rest.
- A library holds the person's own characters and places, plus examples of styles, camera moves and settings to start from.

Who does what:

- **The person** brings creative intent and taste, and makes the choices.
- **The assistant** brings production expertise and best practice, prepares and runs each generation, checks the results, explains problems, and carries out changes.

Taking part should mean creative control, not production paperwork. A beginner should be able to say "This feels too cheerful; I wanted something unsettling", and the assistant turns that into concrete changes. The person shouldn't have to diagnose lighting, composition, performance or generation settings themselves.

## 5. Value proposition

> Make any film, from a reel to a feature, with an assistant that brings production know-how, guides you from wherever you start, and keeps every draft and version one click away.

- **One point of contact.** A single assistant in one simple interface handles everything, from idea to finished film; there are no separate tools to learn or juggle.
- **The right inputs for every shot.** For each generation the assistant assembles the right reference images, writes the prompt for that specific model, and carries framing and continuity from the surrounding shots, so the result matches what the person asked for.
- **Works with every model.** The assistant picks the best video and image model for each shot and switches to better ones as they ship. The person never has to choose or learn a model.
- **Pre-built skills and tools.** The production workflow, film-making best practice and AI prompting come ready-made, so nobody has to learn each tool or build their own system first.
- **References for ideas.** A built-in library of example images and videos (styles, camera angles and moves, lighting, environments) helps people find and show what they want.
- **Consistent characters and places.** Built-in best practice, such as reference sheets for each character and place, keeps them recognisable across shots, scenes and a series of posts.
- **Guidance from any starting point.** An idea, a story, a script, photos or a storyboard: the assistant picks up from there and leads the next step.
- **The tedious work handled.** The assistant drafts and generates; the person reviews, chooses and redirects.
- **Everything in view.** The script, characters and places, storyboard and videos are always one or two clicks away.
- **Safe changes.** Every version is kept, and changing one shot doesn't mean redoing the rest.
- **Clear costs.** People can see what a film, a scene or a change will cost before they commit, instead of watching credits disappear.

## 6. Existing alternatives

| Alternative | Examples | Who it's for | Where we differ |
|---|---|---|---|
| AI film assistants | OpenArt Director, invideo Agent Two, Higgsfield Supercomputer, Google Flow Agent, Pika Director's Suite | Storytellers, freelancers | Already claim the whole lifecycle, idea to edited film, but mostly up to about 5 minutes and on vendor evidence. Google Flow is tied to Veo. We found no full version history, example library or guidance aimed at beginners |
| Short-form studios | CapCut Director Mode, Dreamina Octo, Kling 4.0 | Social creators | Huge reach and series characters, but tied to their owners' models; weaker story guidance (vendor material only) |
| Structured film tools | LTX Studio | Freelancers, filmmakers | Script → scenes → storyboard, but no conversational assistant found |
| Video generators | Runway, Kling, Veo | Brands, agencies, power users | They make shots; the person prepares every input and runs the production. We use them as engines, not compete with them |
| Your own AI system | Claude Code or Codex plus generation tools | Technical creators | Has to be built and maintained by the person; vendors now offer access for these setups |
| Doing it the traditional way | Hiring a studio or freelancers; conventional animation software | Anyone with budget or skills | Expensive or slow; needs specialist skills |

Every product in this category now offers one assistant, saved characters, multi-shot output and, on paper, the whole lifecycle, so those alone won't set us apart. Section 7 sets out what might; all of it still needs hands-on testing. Evidence was recorded in local maintainer research: competitor landscape, October 2026; customer and competitor landscape; and competitor capability verification. Those private planning/research records are not included in public clones. These are historical desk-research observations, not a current hands-on competitive benchmark.

## 7. Positioning and competitive advantage

**Cursor for film-making.** In software, models became good and interchangeable, and the value moved to the agent that uses them well. Video has reached the same point: several labs make strong shots, but a shot isn't a film, and a strong model only delivers what the person wants when its inputs are right. We own the layer that prepares those inputs and turns shots into films.

**Why now.** Shot quality crossed "good enough" in 2025–26. The agent pattern is proven in code, and people now expect it. Short-form narrative content, such as serialised micro-dramas and story-driven reels, is growing fast and short of production capacity.

**What we can defend:**

- **Getting each shot right.** Choosing references, writing model-specific prompts and carrying continuity between shots is hard, specialised work. Doing it well, shot after shot, is the core of the product.
- **Independent of any one model.** Most rivals are tied to one model family; we use the best model for each shot. (Higgsfield also routes across models, so this is necessary but not enough.)
- **Built to hold together at length.** Shots, scenes and films, with every version kept and changes contained, are designed to stay coherent beyond the roughly 5-minute ceiling most rivals report. This has to be proven.
- **Know-how as the product.** Best practice, consistency techniques and per-model prompting are skills the assistant uses, and they improve with every film.

**How it compounds:**

- **Data on what works:** every choice between versions, every change request and every accepted shot shows what matters to creators and which inputs produce the right shots and scenes. Model labs don't get this signal from inside a creator's workflow, and it can train a specialised model of our own.
- **Curated best practice:** the workflows, techniques and prompting the assistant uses are continually evaluated against real results and improved, so the know-how gets better with every film.
- **The library:** a creator's characters, places, looks and series continuity live with us.
- **Specialisation:** a dedicated film assistant should beat a general agent with plugins, as Cursor does for code.

**Wedge.** Short-form series creators first, then short films and episodes on the same structure.
