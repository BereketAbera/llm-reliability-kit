export type EvalCategory = "objection" | "email" | "call moment";

export interface EvalCase {
  id: string;
  question: string;
  category: EvalCategory;
  /** Any of these approved line IDs counts as on method. */
  expected: string[];
}

/** 30 questions reps really ask, each tied to the approved line a good answer must contain. */
export const EVAL_SUITE: EvalCase[] = [
  { id: "Q01", category: "objection", question: "The prospect says our price is way too high. What do I say?", expected: ["OBJ-1.2"] },
  { id: "Q02", category: "objection", question: "They told me there's no budget for this until next year.", expected: ["OBJ-2.2"] },
  { id: "Q03", category: "objection", question: "Customer keeps asking me to just email over some info.", expected: ["OBJ-3.2"] },
  { id: "Q04", category: "objection", question: "We're good, we already work with someone for that.", expected: ["OBJ-4.2"] },
  { id: "Q05", category: "objection", question: "She needs to run it by her boss before anything happens.", expected: ["OBJ-5.2"] },
  { id: "Q06", category: "objection", question: "He told me to call him back next quarter.", expected: ["OBJ-6.2"] },
  { id: "Q07", category: "objection", question: "They tried a tool like ours two years ago and it failed.", expected: ["OBJ-7.2"] },
  { id: "Q08", category: "objection", question: "A competitor quoted them a lower number than us.", expected: ["OBJ-8.2"] },
  { id: "Q09", category: "objection", question: "She said she wants to sleep on it.", expected: ["OBJ-9.2"] },
  { id: "Q10", category: "objection", question: "Cold call, and the guy says he's not interested.", expected: ["OBJ-10.2"] },
  { id: "Q11", category: "objection", question: "They're locked into a contract with another company until spring.", expected: ["OBJ-11.2"] },
  { id: "Q12", category: "objection", question: "Guy picked up and said bad time, he's slammed.", expected: ["OBJ-12.2"] },
  { id: "Q13", category: "email", question: "What should my follow-up email say after a first call?", expected: ["EML-1.2"] },
  { id: "Q14", category: "email", question: "Prospect has gone dark since the demo. What now?", expected: ["EML-3.2"] },
  { id: "Q15", category: "email", question: "I sent a proposal last week and heard nothing back.", expected: ["EML-4.2"] },
  { id: "Q16", category: "email", question: "How do I reply when someone emails asking for pricing?", expected: ["EML-7.2"] },
  { id: "Q17", category: "call moment", question: "What's a good way to open a cold call?", expected: ["OPN-1.2"] },
  { id: "Q18", category: "call moment", question: "The receptionist asks what the call is regarding.", expected: ["OPN-2.2"] },
  { id: "Q19", category: "call moment", question: "How do I ask for the next step at the end of a meeting?", expected: ["CLS-1.2"] },
  { id: "Q20", category: "objection", question: "The buyer is pushing hard for a discount.", expected: ["CLS-4.2"] },
  { id: "Q21", category: "email", question: "What do I write in a recap email after a demo?", expected: ["EML-2.2"] },
  { id: "Q22", category: "email", question: "Write a first email to a prospect who has never heard of us.", expected: ["EML-5.2"] },
  { id: "Q23", category: "email", question: "How do I ask a customer to introduce me to someone they know?", expected: ["EML-6.2"] },
  { id: "Q24", category: "call moment", question: "What should I say when I get their voicemail?", expected: ["OPN-3.2"] },
  { id: "Q25", category: "call moment", question: "What discovery question shows what doing nothing will cost them?", expected: ["OPN-4.2"] },
  { id: "Q26", category: "call moment", question: "How do I find out who else is involved in the decision?", expected: ["OPN-5.2"] },
  { id: "Q27", category: "call moment", question: "How do I confirm who does what before we hang up?", expected: ["CLS-2.2"] },
  { id: "Q28", category: "email", question: "Email to confirm tomorrow's meeting.", expected: ["EML-8.2"] },
  { id: "Q29", category: "objection", question: "pirce is to hihg they say", expected: ["OBJ-1.2"] },
  { id: "Q30", category: "objection", question: "They like it, but money is tight and their boss decides.", expected: ["OBJ-2.2"] },
];

export const EVAL_THRESHOLD = 24;
