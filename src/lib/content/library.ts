import { defineDocument, type LibraryDocument } from "./types";

/**
 * The Clear Next Step method (fictional). Written for this demo; it is not any
 * real trainer's material. Every conversation should end with one specific,
 * dated next step the buyer has agreed to.
 */
export const METHOD_NAME = "the Clear Next Step method (fictional)";

const principles = defineDocument({
  code: "PRN",
  slug: "core-principles",
  title: "Core principles",
  version: 2,
  status: "approved",
  approvedOn: "2026-09-14",
  sections: [
    {
      title: "One call, one next step",
      tags: ["next step", "end of call", "goal of a call", "wrap up"],
      why: "Every conversation ends with one specific next step the buyer has agreed to, with a day and a time. A call that ends with 'let's stay in touch' has no next step.",
      say: ["Before we hang up, what is the one next step that makes sense for you, and when should it happen?"],
    },
    {
      title: "Name it, then narrow it",
      tags: ["concern", "worry", "pushback", "hesitation", "risk"],
      why: "When a buyer raises a concern, say it back in plain words, then narrow it to the one thing that would have to be true. You are not arguing; you are making the concern small enough to solve.",
      say: ["It sounds like the real concern is the risk of switching. If we took that off the table, would anything else stand in the way?"],
    },
    {
      title: "Price follows proof",
      tags: ["value", "proof", "when to talk price", "quote too early"],
      why: "Never quote or defend a price until the buyer has said, in their own words, what the problem costs them. Price without proof sounds expensive; price after proof sounds like a decision.",
      say: ["I'll give you a number today, and I want it to mean something. First, what does this problem cost you now?"],
    },
    {
      title: "Two doors",
      tags: ["two options", "choice", "either or", "offer options"],
      why: "Offer two concrete next steps that both move forward, so the question is which, not whether.",
      say: ["Would it be easier to walk your team through it on Tuesday, or should I send a two-minute video they can watch first?"],
    },
    {
      title: "Calendar before close",
      tags: ["calendar", "schedule", "book a meeting", "invite", "slip"],
      why: "A next step only counts if it is on both calendars before the call ends. Send the invite while you are still talking.",
      say: ["Let's put it on the calendar now so it doesn't slip. Does Thursday at ten work, or is the afternoon better?"],
    },
    {
      title: "Silence is a step",
      tags: ["silence", "pause", "talking too much", "wait for answer"],
      why: "After you ask for the next step, stop talking. Count to five in your head. The first person to fill the silence usually gives something away.",
      say: ["I'll stop there. What do you think?"],
    },
  ],
});

const objections = defineDocument({
  code: "OBJ",
  slug: "objection-playbook",
  title: "Objection playbook",
  version: 3,
  status: "approved",
  approvedOn: "2026-10-02",
  sections: [
    {
      title: "Price: 'It costs too much'",
      tags: ["objection", "price", "price too high", "too expensive", "costs too much", "afford", "pricey"],
      why: "Don't defend the price and don't discount. Move the conversation to the cost of the problem first; the price only means something next to that number.",
      say: [
        "That's fair to raise. Before we talk about our price, can we put a number on what this problem costs you each month?",
        "If the problem costs less than we do, I'll be the first to tell you not to buy.",
      ],
    },
    {
      title: "Budget: 'We don't have the budget'",
      tags: ["objection", "budget", "no budget", "money", "funds", "spending freeze"],
      why: "No budget is a timing fact, not a no. Find out when budgets are set and who sets them, then help your contact bring numbers to that meeting.",
      say: [
        "That helps, thank you. When is the next budget set, and who decides what goes on the list?",
        "Would it help if I put the numbers on one page so you can bring them to that meeting?",
      ],
    },
    {
      title: "'Just send me some information'",
      tags: ["objection", "send information", "send info", "brochure", "email me something", "materials"],
      why: "'Send me something' usually ends the call. Narrow it to one question so what you send has a reason to be opened, and agree when you'll talk about it.",
      say: [
        "Happy to. So I send the right thing and not a pile of brochures, what is the one question you want it to answer?",
        "I'll send it this afternoon. Can we take ten minutes on Thursday to go over it together?",
      ],
    },
    {
      title: "'We're happy with our current vendor'",
      tags: ["objection", "current vendor", "supplier", "incumbent", "already have", "happy with"],
      why: "Don't attack the incumbent; it insults the person who chose them. Ask for the one thing they would improve. That is where your next step lives.",
      say: ["Good, that tells me they're doing a lot right. If you could change one thing about how it works today, what would it be?"],
    },
    {
      title: "'I need to talk to my boss'",
      tags: ["objection", "boss", "manager", "decision maker", "approval", "run it by", "sign off"],
      why: "Your contact has to sell this inside the company without you. Find the first question their manager will ask and answer it together, now.",
      say: [
        "That makes sense. When you bring this to your manager, what's the first question they'll ask, and can we answer it together right now?",
        "Would it help if I joined the first ten minutes of that conversation, or would you rather take it in on your own?",
      ],
    },
    {
      title: "Timing: 'Call me next quarter'",
      tags: ["objection", "timing", "next quarter", "later", "not now", "bad time", "next year"],
      why: "Find out what changes next quarter. If nothing changes, the timing objection is really a priority objection, and you should talk about priority.",
      say: [
        "I can do that. What will be different next quarter that makes it a better time?",
        "Let's put fifteen minutes on the calendar for the first week of the quarter. If things change before then, you can move it.",
      ],
    },
    {
      title: "'We tried something like this before'",
      tags: ["objection", "tried before", "bad experience", "failed", "burned", "didn't work"],
      why: "Ask what went wrong before you explain why you're different. The answer tells you exactly what you have to prove.",
      say: ["That's worth hearing about. What happened last time, and what would have needed to go differently?"],
    },
    {
      title: "'A competitor is cheaper'",
      tags: ["objection", "competitor", "cheaper", "lower price", "other quote", "alternative"],
      why: "Compare the total cost of the outcome, not the line item. A cheaper tool that takes more of the team's time is not cheaper.",
      say: ["They may well be cheaper. Can we compare what each option costs you over a full year, including the time your team spends on it?"],
    },
    {
      title: "'I need to think about it'",
      tags: ["objection", "think about it", "think it over", "not sure", "consider", "mull it over"],
      why: "Thinking is fine; vague thinking is not. Ask which part they want to think through, and offer to think it through with them.",
      say: ["Of course. So you're not thinking it through alone, which part is still open for you: the price, the timing, or the fit?"],
    },
    {
      title: "'Not interested' on a cold call",
      tags: ["objection", "not interested", "cold call", "hang up", "no thanks"],
      why: "Respect the no, then ask one question that earns a second sentence. If the answer is still no, thank them and leave.",
      say: ["Fair enough, I called out of the blue. Before I let you go, is fixing this on anyone's list this year, or is it truly not a problem?"],
    },
    {
      title: "'We're locked into a contract'",
      tags: ["objection", "contract", "locked in", "signed", "renewal", "agreement"],
      why: "A contract is a date, not a wall. Find the end date and work back to when they would need to start looking.",
      say: ["Understood. When does the current contract end, and when would you need to start looking so you have real options?"],
    },
    {
      title: "'I'm too busy right now'",
      tags: ["objection", "busy", "no time", "swamped", "call back"],
      why: "Separate a bad minute from a bad month. One is a callback; the other is a priority conversation.",
      say: ["I'll be quick. Is this a bad minute or a bad month? If it's the minute, when should I call you back today?"],
    },
  ],
});

/** Kept to show the rule: only the current approved version is ever searched. */
const objectionsOld = defineDocument({
  code: "OBJ2",
  slug: "objection-playbook",
  title: "Objection playbook",
  version: 2,
  status: "superseded",
  approvedOn: "2026-03-11",
  sections: [
    {
      title: "Price",
      tags: ["objection", "price", "too expensive"],
      why: "Ask what the problem costs.",
      say: ["I understand. What would you say the problem is costing you?"],
    },
    {
      title: "Send information",
      tags: ["objection", "send information"],
      why: "Get the email address.",
      say: ["Sure, what's the best address to send it to?"],
    },
  ],
});

const emails = defineDocument({
  code: "EML",
  slug: "email-playbook",
  title: "Email playbook",
  version: 2,
  status: "approved",
  approvedOn: "2026-09-28",
  sections: [
    {
      title: "Follow-up after a first call",
      tags: ["email", "follow-up email", "after first call", "after discovery call", "thank you email"],
      why: "Every email has three lines: why you're writing, what's in it for them, and the next step with a date. Use their words for the problem and end with a time, not 'let me know'.",
      say: ["Thanks for your time today. You said the biggest cost right now is [their words]. Can we take twenty minutes on [day] to walk through what fixing it would be worth?"],
    },
    {
      title: "Recap after a demo",
      tags: ["email", "demo recap", "after the demo", "summary email", "recap"],
      why: "A recap that lists who does what by when turns a good demo into a next step.",
      say: ["Here is what we agreed: you'll share the demo with [name], I'll send the pricing options, and we'll decide together on [day]. Reply yes and I'll send the invite."],
    },
    {
      title: "No reply: closing the file",
      tags: ["email", "no reply", "ghosted", "not responding", "went quiet", "breakup email", "last email"],
      why: "Closing the file gives the buyer an easy way to answer. A one-word reply is easier than an explanation.",
      say: ["I haven't heard back, so I'll assume this isn't a priority right now and close the file. If that's wrong, reply with one word, open, and I'll pick it back up."],
    },
    {
      title: "Proposal sent, no response",
      tags: ["email", "proposal", "quote sent", "no response", "follow up on proposal"],
      why: "Ask which part is stuck, and make the answer small.",
      say: ["Checking one thing on the proposal: is it the numbers, the timing, or the people involved that's holding it up? A one-word answer is plenty."],
    },
    {
      title: "Cold outreach",
      tags: ["email", "cold email", "first email", "prospecting", "outreach", "never heard of us"],
      why: "Lead with the problem you think they have and ask if you're right. Earn a reply, not a meeting.",
      say: ["I'm writing because teams like yours often lose hours each week to [problem]. Is that true for you, or am I off base?"],
    },
    {
      title: "Asking for an introduction",
      tags: ["email", "referral", "introduction", "intro", "introduce me", "who else"],
      why: "Make the introduction easy to send and easy to decline.",
      say: ["You mentioned [name] deals with the same problem. Would you be comfortable sending a two-line introduction? I'll keep it short and let them decide."],
    },
    {
      title: "Reply to 'send me pricing'",
      tags: ["email", "pricing request", "send pricing", "price list", "how much", "quote request"],
      why: "Pricing without context is just a number. Ask the two questions that change the price.",
      say: ["Glad to. Pricing depends on two things: team size and how fast you want to start. Can you give me those two answers, or would a five-minute call be easier?"],
    },
    {
      title: "Confirming tomorrow's meeting",
      tags: ["email", "meeting confirmation", "reminder", "tomorrow", "confirm the meeting"],
      why: "Confirm the time and the purpose, and make it easy to move the meeting rather than skip it.",
      say: ["Looking forward to tomorrow at [time]. The one thing I'd like to understand is [question]. If anything has changed, just reply and we'll move it."],
    },
  ],
});

const discovery = defineDocument({
  code: "OPN",
  slug: "openers-and-discovery",
  title: "Call openers and discovery",
  version: 1,
  status: "approved",
  approvedOn: "2026-08-20",
  sections: [
    {
      title: "Cold call opener",
      tags: ["opener", "cold call", "opening line", "start a call", "first thirty seconds"],
      why: "Admit it's a cold call, ask for thirty seconds, and give them the choice. Honesty buys more time than a script that pretends to know them.",
      say: ["Hi, it's [name]. You weren't expecting my call, so I'll take thirty seconds to tell you why I picked you, and then you decide if we keep going. Fair?"],
    },
    {
      title: "Getting past the front desk",
      tags: ["gatekeeper", "receptionist", "front desk", "assistant", "what is this regarding"],
      why: "Ask for help, not for a person. People like pointing others in the right direction.",
      say: ["I'm hoping you can point me in the right direction. Who on your team looks after [area]? I'd rather ask the right person than the wrong one."],
    },
    {
      title: "Voicemail",
      tags: ["voicemail", "leave a message", "no answer", "answering machine"],
      why: "One question, one reason, one time you'll call back. Leave no pitch.",
      say: ["Hi [name], it's [your name]. I have one question about [area] that should take two minutes. I'll try you again Thursday morning."],
    },
    {
      title: "Discovery: the cost of doing nothing",
      tags: ["discovery", "cost of doing nothing", "pain", "impact", "what it costs"],
      why: "The buyer's own number is the strongest proof you will ever have. Ask for it in hours or dollars.",
      say: ["If nothing changes in the next six months, what does that cost you, in hours or in dollars?"],
    },
    {
      title: "Discovery: how decisions get made",
      tags: ["discovery", "decision process", "who decides", "who is involved", "stakeholders", "buying process"],
      why: "Ask how the last similar decision was made. The past is a better map than a guess about the future.",
      say: ["When your team made a decision like this before, who was involved, and how long did it take from yes to signed?"],
    },
    {
      title: "Discovery: priority check",
      tags: ["discovery", "priority", "importance", "urgency", "how important"],
      why: "A problem that isn't a priority won't get a next step. Find out where it sits.",
      say: ["Compared with everything else on your plate this quarter, where does fixing this rank?"],
    },
  ],
});

const closing = defineDocument({
  code: "CLS",
  slug: "closing-and-next-steps",
  title: "Closing and next steps",
  version: 2,
  status: "approved",
  approvedOn: "2026-10-10",
  sections: [
    {
      title: "Asking for the next step",
      tags: ["next step", "ask for the next step", "end of the meeting", "wrap up", "close the call"],
      why: "Suggest the next step yourself, then let them improve it. Buyers rarely propose one on their own.",
      say: ["Based on what you've told me, the next step I'd suggest is [step]. Does that make sense, or is there a better first step?"],
    },
    {
      title: "Confirming who does what",
      tags: ["confirm", "recap out loud", "who does what", "action items", "agree", "before we hang up"],
      why: "Say both sides' actions out loud with dates. If it isn't said, it isn't agreed.",
      say: ["Just so we're both clear: you'll [their action] by [day], and I'll [my action] by [day]. Did I get that right?"],
    },
    {
      title: "Checking for anything in the way",
      tags: ["trial close", "anything in the way", "reason not to", "objections left"],
      why: "Ask for objections while there is still time to answer them.",
      say: ["If everything we've talked about holds up, is there any reason you wouldn't move ahead?"],
    },
    {
      title: "When they ask for a discount",
      tags: ["discount", "negotiate", "better price", "deal", "price reduction"],
      why: "Never give without getting. Trade price for something that has value to you.",
      say: ["I can look at that. If we adjust the price, what can you adjust on your side: a longer term, a faster start, or a case study?"],
    },
    {
      title: "Asking for the decision",
      tags: ["close", "ask for the business", "decision", "sign", "paperwork"],
      why: "When the problem and the proof are clear, ask plainly. Give two doors: start now, or one more conversation.",
      say: ["It sounds like this solves the problem you described. Shall we start the paperwork today, or do you need one more conversation first?"],
    },
  ],
});

export const ALL_DOCUMENTS: LibraryDocument[] = [principles, objections, objectionsOld, emails, discovery, closing];
