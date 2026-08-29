// src/lib/warmupTopics.ts

const SUBJECT_PREFIXES = [
  "Quick update on",
  "Notes regarding",
  "Follow-up on",
  "Action items from",
  "Brief sync regarding",
  "Thoughts on",
  "Reviewing",
  "Discussion points for",
  "Status update on",
  "Regarding our plan for",
  "Summary of",
  "Details about",
];

const SUBJECT_TOPICS = [
  "project roadmap",
  "upcoming sprint",
  "client deliverables",
  "architecture design",
  "weekly schedule",
  "quarterly objectives",
  "strategy deck",
  "team coordination",
  "milestone checklist",
  "production sync",
  "deployment pipeline",
  "workflow optimization",
  "performance review",
];

const INTROS = [
  "Hope you are having a productive week.",
  "Just touching base regarding our latest discussion.",
  "Wanted to quickly drop this note for your review.",
  "Following up on our earlier conversation.",
  "Hope everything is going smoothly on your end.",
  "Reaching out to keep you in the loop on this.",
];

const BODIES = [
  "I went through the documentation and the overall flow looks solid. A few minor adjustments might be needed later, but nothing urgent.",
  "Everything seems aligned with what we planned. Let me know if you want to make any tweaks before we proceed further.",
  "I have verified the primary points from my side. We can go ahead with the next phase whenever you're ready.",
  "The current timeline looks realistic. I'll make sure the deliverables are prepped by the end of the week.",
  "Just reviewed the latest update. The structure is much clearer now, and the team should find it easy to follow.",
  "Thanks for putting this together. The initial feedback looks positive, and we can discuss additional details in our next sync.",
];

const CALL_TO_ACTIONS = [
  "Let me know if you have any questions or suggestions.",
  "Feel free to share your thoughts whenever you get a minute.",
  "No rush on this—take a look whenever convenient.",
  "Looking forward to hearing your perspective on this.",
  "Keep me posted if anything changes from your side.",
];

export function getRandomWarmupMessage(tag: string = "[WU-VERIFIED]") {
  const prefix = SUBJECT_PREFIXES[Math.floor(Math.random() * SUBJECT_PREFIXES.length)];
  const topic = SUBJECT_TOPICS[Math.floor(Math.random() * SUBJECT_TOPICS.length)];
  
  // रैंडम सब्जेक्ट: "Notes regarding client deliverables [WU-VERIFIED]"
  const subject = `${prefix} ${topic} ${tag}`;

  const intro = INTROS[Math.floor(Math.random() * INTROS.length)];
  const body = BODIES[Math.floor(Math.random() * BODIES.length)];
  const cta = CALL_TO_ACTIONS[Math.floor(Math.random() * CALL_TO_ACTIONS.length)];

  // कंटेंट हैश को 100% यूनिक रखने के लिए रैंडम रेफरेंस ID
  const randomRef = `Ref: #${Math.floor(100000 + Math.random() * 900000)}`;

  return {
    subject,
    intro,
    body,
    cta,
    randomRef,
  };
}