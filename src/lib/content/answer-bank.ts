export interface BankEntry {
  id: string;
  intent: string;
  /** The approved line, by ID. Its text is read from the library, so the two can never drift apart. */
  lineId: string;
  /**
   * Keyword groups. Any group fully present in the question is a keyword hit.
   * Each group pins the situation ("no" + "budget"), so a topic word alone
   * ("budget" in "what's my budget for the offsite?") is not enough.
   */
  keywords: string[][];
  /**
   * Single topic words that count only when the question carries the buyer's side
   * ("they want a discount"), not the rep's own task ("is there a discount code?").
   */
  buyerKeywords?: string[][];
  /** Ways reps ask. Used for fuzzy intent matching. Never a copy of a test question (a test checks). */
  examples: string[];
  approvedBy: string;
  approvedOn: string;
}

const approvedBy = "the head trainer (fictional)";

export const ANSWER_BANK: BankEntry[] = [
  {
    id: "AB-01",
    intent: "Price is too high",
    lineId: "OBJ-1.2",
    keywords: [["price", "high"], ["expensive"], ["costs", "much"], ["afford"]],
    examples: ["it's too expensive", "they say it costs too much", "we can't afford it", "your price is way more than we expected"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-02",
    intent: "No budget",
    lineId: "OBJ-2.2",
    keywords: [["no", "budget"], ["dont", "budget"], ["budget", "frozen"], ["budget", "freeze"], ["money", "tight"]],
    examples: ["we don't have the budget", "the budget is frozen", "money is tight right now"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-03",
    intent: "Send me information",
    lineId: "OBJ-3.2",
    keywords: [["send", "information"], ["email", "information"], ["brochure"], ["send", "materials"], ["email", "materials"]],
    examples: ["just send me some information", "can you email me some info", "send me a brochure", "email over your materials"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-04",
    intent: "Happy with current vendor",
    lineId: "OBJ-4.2",
    keywords: [["happy", "vendor"], ["current", "vendor"], ["already", "vendor"]],
    examples: ["we're happy with our current vendor", "we already have a supplier", "we're happy with who we use", "we use someone else and it works"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-05",
    intent: "Need to talk to my boss",
    lineId: "OBJ-5.2",
    keywords: [["talk", "manager"], ["run", "by"], ["decision", "maker"], ["manager", "approve"], ["check", "manager"], ["sign", "off"]],
    examples: ["I need to talk to my boss", "my director makes the decision", "I'm not the decision maker"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-06",
    intent: "Call me next quarter",
    lineId: "OBJ-6.2",
    keywords: [["next", "quarter"], ["next", "year"], ["call", "later"], ["few", "months"]],
    examples: ["not a good time, try next year", "reach out in a few months", "call me back later in the year"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-07",
    intent: "Tried something like this before",
    lineId: "OBJ-7.2",
    keywords: [["tried", "before"], ["burned"], ["tried", "failed"]],
    examples: ["we tried something like this before", "we got burned by a similar tool"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-08",
    intent: "Competitor is cheaper",
    lineId: "OBJ-8.2",
    keywords: [["cheaper"], ["competitor", "quoted"], ["competitor", "lower"], ["competitor", "price"], ["quoted", "less"]],
    examples: ["a competitor is cheaper", "another vendor quoted us less", "we found a cheaper option"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-09",
    intent: "Need to think about it",
    lineId: "OBJ-9.2",
    keywords: [["think", "about"], ["think", "over"], ["mull"]],
    examples: ["I need to think about it", "let me think it over", "we'll mull it over and get back to you"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-10",
    intent: "Not interested (cold call)",
    lineId: "OBJ-10.2",
    keywords: [["not", "interested"], ["no", "thanks"]],
    examples: ["not interested", "they said no thanks and tried to hang up", "he's not interested in talking"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-11",
    intent: "Locked into a contract",
    lineId: "OBJ-11.2",
    keywords: [["locked", "contract"], ["contract", "until"], ["contract", "another"], ["contract", "someone"], ["agreement", "until"], ["agreement", "runs"]],
    buyerKeywords: [["locked"]],
    examples: ["we just signed a two year deal with someone else", "our agreement runs until next spring"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-12",
    intent: "Too busy right now",
    lineId: "OBJ-12.2",
    keywords: [["no", "time"], ["dont", "time"]],
    buyerKeywords: [["busy"], ["swamped"]],
    examples: ["I'm too busy right now", "I don't have time for this", "they're swamped this week"],
    approvedBy,
    approvedOn: "2026-10-02",
  },
  {
    id: "AB-13",
    intent: "Follow-up email after a first call",
    lineId: "EML-1.2",
    keywords: [["follow", "email", "call"], ["follow", "email", "first"], ["thank", "email"]],
    examples: ["thank you email after the first meeting", "what do I email after a good discovery call"],
    approvedBy,
    approvedOn: "2026-09-28",
  },
  {
    id: "AB-14",
    intent: "No reply to emails",
    lineId: "EML-3.2",
    keywords: [["ghosted"], ["no", "reply"], ["stopped", "replying"], ["not", "responding"], ["won't", "reply"], ["went", "quiet"]],
    examples: ["they stopped replying to my emails", "the prospect ghosted me", "no response for two weeks", "they went quiet and won't reply"],
    approvedBy,
    approvedOn: "2026-09-28",
  },
  {
    id: "AB-15",
    intent: "Proposal sent, no response",
    lineId: "EML-4.2",
    keywords: [["proposal", "heard"], ["proposal", "nothing"], ["proposal", "follow"], ["proposal", "response"], ["proposal", "answer"], ["proposal", "quiet"], ["quote", "answer"]],
    examples: ["how do I follow up on a proposal", "they have the quote but no answer"],
    approvedBy,
    approvedOn: "2026-09-28",
  },
  {
    id: "AB-16",
    intent: "Reply to a pricing request",
    lineId: "EML-7.2",
    keywords: [["send", "pricing"], ["asking", "pricing"], ["price", "list"], ["pricing", "request"]],
    examples: ["how do I answer a request for a price list", "someone wants me to send pricing"],
    approvedBy,
    approvedOn: "2026-09-28",
  },
  {
    id: "AB-17",
    intent: "Cold call opener",
    lineId: "OPN-1.2",
    keywords: [["open", "cold", "call"], ["start", "cold", "call"], ["opener"]],
    examples: ["how should I start a cold call"],
    approvedBy,
    approvedOn: "2026-08-20",
  },
  {
    id: "AB-18",
    intent: "Gatekeeper",
    lineId: "OPN-2.2",
    keywords: [["gatekeeper"], ["receptionist"], ["front", "desk"], ["regarding"]],
    examples: ["how do I get past the gatekeeper", "the front desk won't put me through"],
    approvedBy,
    approvedOn: "2026-08-20",
  },
  {
    id: "AB-19",
    intent: "Ask for the next step",
    lineId: "CLS-1.2",
    keywords: [["ask", "next", "step"], ["end", "next", "step"]],
    examples: ["how do I finish a call with a clear next step"],
    approvedBy,
    approvedOn: "2026-10-10",
  },
  {
    id: "AB-20",
    intent: "Discount request",
    lineId: "CLS-4.2",
    keywords: [["better", "price"]],
    buyerKeywords: [["discount"]],
    examples: ["they're asking for a discount", "the buyer wants a better price", "can we knock something off the price"],
    approvedBy,
    approvedOn: "2026-10-10",
  },
];
