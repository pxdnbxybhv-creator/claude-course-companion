# Example — Operating Systems

This example shows how the workflow can be used for a small Operating Systems study session.

This is a simplified example. It does not reproduce any copyrighted textbook or lecture material. The knowledge map, questions, and mistakes below are illustrative and were written to demonstrate the shape of each step, not to report a real study session or real results.

## Topic

Virtualization, concurrency, and persistence

## Step 1 — Knowledge map

The learner pastes their own summary of the three main themes of the course into Claude, together with the prompt from [`prompts/01_build_knowledge_map.md`](../prompts/01_build_knowledge_map.md). Claude returns a map along these lines:

```text
Operating Systems
├── Virtualization
│   ├── CPU virtualization
│   ├── processes
│   └── memory virtualization
├── Concurrency
│   ├── threads
│   ├── synchronization
│   └── race conditions
└── Persistence
    ├── files
    ├── storage
    └── file systems
```

Claude also notes that processes are a prerequisite for understanding threads, that "virtualization" is a term likely to cause confusion because it is used for both the CPU and memory, and that the learner's summary does not explain how the OS actually switches between processes. It then asks which section to study first.

The learner chooses CPU virtualization.

## Step 2 — Guided learning

Using [`prompts/02_teach_step_by_step.md`](../prompts/02_teach_step_by_step.md), Claude first explains the intuition behind CPU virtualization, then introduces processes and the idea that the operating system creates the illusion that each program has access to the processor.

Along the way, Claude asks short check questions such as "If two programs are both 'running', what is actually happening on a single-core machine?" and adjusts the pace based on the learner's answers.

At the end of the section, Claude summarizes the key ideas and lists a few things the learner should be able to explain without notes, such as the difference between a program and a process and why the OS needs to switch between processes.

## Step 3 — Diagnostic quiz

Using [`prompts/03_generate_quiz.md`](../prompts/03_generate_quiz.md), Claude generates a short quiz based only on the material covered. Three sample questions:

1. Why is CPU virtualization useful?
2. What is the difference between a program and a process?
3. What illusion does CPU virtualization provide to a running program?

The learner answers all questions before Claude gives any feedback. Claude then marks each answer as correct, partially correct, or incorrect, and explains what was understood and what was missed.

## Step 4 — Mistake review

Using [`prompts/04_review_mistakes.md`](../prompts/04_review_mistakes.md), Claude analyzes the mistakes from the quiz.

Illustrative example:

The learner incorrectly assumes that every running process permanently owns a physical CPU core.

Claude places this in the review table, identifies it as a knowledge gap rather than a memory slip, and connects it to the prerequisite idea of time sharing.

Weak area:
Understanding time sharing and CPU scheduling.

Next review:
Revisit how the OS switches between processes.

The review plan for the next session is short: re-read the relevant part of the course notes on context switching, then return to `02_teach_step_by_step.md` for the scheduling section, and finish with a new quiz focused on time sharing.

## Notes

- The mistake above is a made-up example chosen because it is a common misunderstanding, not a record of anyone's actual quiz result.
- In a real session, the learner would paste their own notes rather than a three-line summary, and the knowledge map would be correspondingly more detailed.
- Any technical explanation Claude gives during a session like this should be checked against the course's own materials.
