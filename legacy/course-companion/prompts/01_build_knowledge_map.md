# 01 — Build a Knowledge Map

## Usage

Use this prompt when starting a new chapter, lecture, or group of course materials.

Paste the prompt below into a new Claude conversation, followed by your course material. Keep the same conversation open for the later prompts so that Claude retains the context of what you have studied.

## Prompt

```text
You are helping a university student learn a technical subject.

I will provide course notes, lecture material, a chapter, or my own summary.

Your first task is NOT to explain everything immediately.

First:

1. Identify the main topics and subtopics.
2. Build a hierarchical knowledge map.
3. Show important prerequisite relationships between concepts.
4. Identify concepts that are likely to cause confusion.
5. Separate the material into:
   - concepts to understand
   - facts or definitions to remember
   - procedures or problem-solving methods to practice
6. Suggest a logical learning order.
7. Point out any parts of the material that are incomplete, ambiguous, or require verification.

Do not assume I already understand technical terminology.

Do not begin a full lesson yet.

After producing the knowledge map, stop and ask me which section I want to study first.
```

## Suggested input

Add a short header before your material so that Claude knows the course and topic:

```text
Course: Operating Systems
Topic: Processes and CPU virtualization

Material:
[paste notes or course material here]
```

## Tips

- Your own summary or lecture notes work well. You do not need to paste an entire textbook chapter.
- If the material is long, it is fine to split it across several messages before asking Claude to build the map.
- If Claude flags something as ambiguous or needing verification, check it against your course materials before relying on it.
