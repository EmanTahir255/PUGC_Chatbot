# Query Answering Stages

This file explains how query answering evolved in the project across different stages.

## Legend

- `✓` = present / used in that stage
- `✗` = not present
- `~` = partially present / limited behavior

## Stage Names

1. **Stage 1 - Basic Rasa + FAQ DB**
2. **Stage 2 - Rasa + Groq Intent Fallback**
3. **Stage 3 - Relevance Check + Presentation Refinement**
4. **Stage 4 - Grounded Fallback Safety**
5. **Stage 5 - Current Strict Structured DB Stage**
6. **Stage 6 - Asked / Good Idea but Never Fully Implemented**
7. **Current State - After Rollback**

| Step / Behavior | Stage 1 Basic | Stage 2 Groq Fallback | Stage 3 Relevance + Refinement | Stage 4 Grounded Safety | Stage 5 Current Strict | Stage 6 Asked / Ideal but never fully existed | Current State |
|---|---|---|---|---|---|---|---|
| Frontend message backend ko bhejta hai | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| History clean hoti hai (`AI is thinking...` waghera hata kar) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Vague follow-up message enrich hota hai | ✗ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rasa pehle intent detect karta hai | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Agar Rasa confidence `< 0.5` ho to Groq intent extract karta hai | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Agar Rasa confidence `>= 0.5` ho to Groq intent double-check karta hai | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Dynamic table query pehle try hoti hai | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| FAQ DB answer fallback ke taur par use hota hai | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Groq answer ki relevance user query se check karta hai | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Relevant DB answer ko Groq user-friendly presentation mein refine karta hai | ✗ | ✗ | ✓ | ✓ | ✗ (structured ke liye) | ✓ | ✓ |
| Groq ko specifically bola gaya tha ke facts change na kare | ✗ | ✗ | ~ | ✓ | ✓ | ✓ | ~ |
| Wrong/irrelevant DB answer par grounded fallback use hota hai | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Structured table answers par Groq ko bilkul bypass kiya jata hai | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Admin panel se updated DB data dynamic query mein directly reflect hota hai | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Groq university-specific facts guess/invent kar sakta tha | ✓ | ✓ | ✓ | ~ | ✗ (target behavior) | ✗ | ~ |
| Suggested next questions attach hoti hain | ✗ | ✗ | ✗ | ~ | ✓ | ✓ | ✓ |
| Post-save admin advisory notices (Programs / FAQs / Departments / Events) | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |

## Direct Answers To Specific Questions

| Question | Answer |
|---|---|
| Kya high confidence par bhi Groq intent confirm karta tha? | **Nahi** |
| Kya low confidence par Groq intent extract karta tha? | **Haan** |
| Kya DB answer aane ke baad Groq relevance check karta tha? | **Haan, Stage 3 se** |
| Kya Groq presentation refine karta tha bina info badle? | **Intent yehi tha, lekin practical mein kabhi kabhi info expand kar deta tha** |
| Kya structured dynamic table answers par Groq chal raha tha? | **Pehle haan / indirectly**, ab **nahi** |
| Kya current stage mein dynamic table answers direct DB se jaate hain? | **Haan** |

## Kya Sahi Tha, Kya Ghalat Tha

### Sahi cheezen

- Rasa first layer hona
- low confidence par Groq fallback
- DB answer ki relevance check
- grounded fallback
- structured dynamic answers ko direct DB se return karna
- admin updates ko live data ke taur par use karna

### Ghalat / risky cheezen

- Groq se structured university facts polish karwana, kyun ke woh expand kar sakta tha
- vague follow-up par wrong intent detect ho jana
- high-confidence Rasa answer ko bina additional safety ke directly humanized karwana
- broad DB answer ko Groq se "complete" karwane dena

### Acha idea jo poocha gaya lekin fully implement nahi hua

- high confidence par bhi Groq se intent **double-check / confirm** karwana

Yeh idea useful ho sakta hai, lekin:

- latency barhata hai
- complexity barhata hai
- har query par extra AI call lagti hai

Is liye current architecture mein:

- intent double-check se zyada important hai
- structured answers ko direct DB se rakhna

## Current Practical Summary

Current strict stage mein:

1. User message frontend se backend ko jata hai
2. History clean hoti hai
3. Vague follow-up ho to enrich hota hai
4. Rasa intent detect karta hai
5. Low confidence ho to Groq intent extraction fallback hota hai
6. Dynamic table query pehle chalti hai
7. Structured answer mil jaye to direct DB result return hota hai
8. FAQ answer ho to grounded handling hoti hai
9. Groq ko university-specific facts guess nahi karne chahiye
