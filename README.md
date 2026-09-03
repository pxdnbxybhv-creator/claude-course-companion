# Claude Course Companion

A lightweight workflow for using Claude as a structured learning partner for university courses.

Instead of asking AI for isolated answers, Claude Course Companion provides a reusable workflow for turning course materials into structured learning sessions.

This is a set of Markdown prompts, not an application. There is no code to install and no API key required. It is designed for use with Claude, but it is an independent student project and is not affiliated with or endorsed by Anthropic.

## What it helps you do

- Build a knowledge map from course materials
- Identify prerequisites and difficult concepts
- Learn topics step by step
- Generate diagnostic practice questions
- Analyze mistakes and weak areas
- Create focused review plans
- Maintain context across a study session

## Why I built this

I am a Computer Science and Technology undergraduate at Harbin Engineering University. Many students, including me at times, use AI mainly for quick answers.

I wanted to explore a different approach: using Claude as a long-context learning workspace that helps me understand how concepts connect, reason through difficult material, test my understanding, and review my mistakes systematically. Rather than pasting in a question and copying the answer, I give Claude the course materials and the full context, ask it to build a structure first, and then work through that structure one section at a time.

This repository turns that personal workflow into a small set of reusable prompts that other students can adapt to their own courses.

The guiding idea is simple: AI should support learning, not replace learning.

## Workflow

```text
Course Material
      ↓
Knowledge Map
      ↓
Step-by-Step Learning
      ↓
Diagnostic Quiz
      ↓
Mistake Analysis
      ↓
Next Review Session
```

Each stage has a corresponding prompt. The prompts are meant to be used in a single Claude conversation so that later stages can build on what was covered earlier.

### 1. Build the knowledge map

Use [`prompts/01_build_knowledge_map.md`](prompts/01_build_knowledge_map.md)

Paste your notes, lecture material, or your own summary. Claude organizes the material into a hierarchical map, points out prerequisites and likely points of confusion, and suggests a learning order. It does not start teaching yet; it asks which section you want to study first.

### 2. Learn one section

Use [`prompts/02_teach_step_by_step.md`](prompts/02_teach_step_by_step.md)

Pick one section from the map. Claude explains each concept in layers (intuition, formal definition, connection to earlier concepts, example, common mistake) and checks your understanding with short questions before moving on.

### 3. Test understanding

Use [`prompts/03_generate_quiz.md`](prompts/03_generate_quiz.md)

Claude generates a short diagnostic quiz based only on what was studied in the conversation. You answer first; then Claude grades each answer, explains what was right and wrong, and identifies your strongest and weakest areas.

### 4. Review mistakes

Use [`prompts/04_review_mistakes.md`](prompts/04_review_mistakes.md)

Claude turns your mistakes into a review table, separates knowledge gaps from reasoning and memory errors, and produces a concise review plan for the next study session.

## Example

[`examples/operating-systems-example.md`](examples/operating-systems-example.md) walks through a small, simplified Operating Systems study session to show what each stage of the workflow looks like in practice.

## Responsible use

See [Responsible Use](RESPONSIBLE_USE.md).

Claude Course Companion is designed to support learning rather than replace independent thinking. It works best when you attempt problems yourself, verify what you are told, and follow your course's academic integrity policies.

## Getting started

1. Open Claude.
2. Prepare your course notes, lecture materials, or your own summary.
3. Start with `01_build_knowledge_map.md`.
4. Select one section to study.
5. Continue through the workflow.
6. Verify important technical information against your course materials.

Do not publicly upload copyrighted course materials unless you have permission. Pasting your own notes into a private conversation is different from publishing someone else's slides or textbook in a public repository.

## Adapting the workflow

The prompts are subject-agnostic. I developed them around my own computer science coursework, but the same structure should apply to other structured university subjects, such as:

- Operating Systems
- Algorithms
- Computer Networks
- Computer Architecture
- Mathematics
- Engineering courses
- Other structured university subjects

You may want to adjust the quiz format or the number of questions for courses that are more proof-based or more calculation-heavy. Contributions of subject-specific examples are welcome; see [Contributing](CONTRIBUTING.md).

## Project status

This is an early, lightweight project based on a personal learning workflow. Feedback and improvements are welcome.

## License

MIT License. See [LICENSE](LICENSE).
