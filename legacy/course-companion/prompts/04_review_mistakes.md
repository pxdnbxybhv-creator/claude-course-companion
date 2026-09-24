# 04 — Review Mistakes

## Usage

Use this after completing a quiz or problem-solving session.

Send this prompt in the same conversation, after the quiz has been graded, so that Claude can refer back to your actual answers.

## Prompt

```text
Analyze the mistakes I made during this study session.

Create a review table with these columns:

| Concept | My misunderstanding | Correct understanding | Why the mistake may have happened | Follow-up question |

Then:

1. Identify my top 3 weak areas.
2. Separate:
   - knowledge gaps
   - reasoning mistakes
   - memory mistakes
3. Explain which prerequisite concepts I may need to revisit.
4. Generate one short follow-up question for each weak area.
5. Create a focused review plan for my next study session.

The review plan should be realistic and concise.

Do not simply repeat the entire lesson.

Prioritize the areas that caused the most important mistakes.
```

## Tips

- Save the review table and the review plan somewhere you will see them before your next session. The workflow is more useful when the next session actually starts from the plan.
- When you begin the next session, you can paste the review plan into a new conversation together with the relevant course material and start again from `01_build_knowledge_map.md` or go directly to `02_teach_step_by_step.md` for the weak areas.
- Keep in mind that the categorization (knowledge gap vs. reasoning vs. memory) is a helpful lens, not a diagnosis. You know your own thinking better than the model does.
