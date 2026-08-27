export const WARMUP_SUBJECTS = [
  "Quick sync on project timeline",
  "Notes from our earlier discussion",
  "Regarding next week schedule",
  "Updated document review",
  "Feedback on recent deliverables",
  "Quick question about the presentation",
  "Follow-up on the design proposal",
  "Meeting notes and next steps",
  "Checking in on the status update",
];

const WARMUP_BODIES = [
  "I have reviewed the points we discussed earlier and everything looks on track. Let me know if you need any adjustments before we proceed.",
  "Just checking in to confirm our agenda for tomorrow. Please find a moment to look over the details whenever convenient.",
  "Thanks for sharing the update earlier. I will go through the files and get back to you with my thoughts by the end of the day.",
  "I went through the shared draft. Looks solid overall. Just have a couple of minor suggestions which I will send over shortly.",
  "Did you get a chance to see the latest version? The structure looks much cleaner now. Let me know what you think.",
  "Thanks for sending that over. I agree with the suggested approach. Let us proceed accordingly.",
  "Let me know when you are free for a quick 5-minute sync regarding the roadmap.",
];

export function getRandomWarmupMessage() {
  const subject = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
  const body = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)];

  return {
    subject,
    body,
  };
}