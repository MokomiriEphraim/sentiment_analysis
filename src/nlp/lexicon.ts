/**
 * Comprehensive client-side sentiment & emotion lexicon
 * Based on AFINN-165, NRC Emotion, and VADER valence rules.
 */

export const AFINN_LEXICON: Record<string, number> = {
  // Positive valence words (1 to 5)
  "superb": 4, "outstanding": 4, "exceptional": 4, "flawless": 4, "brilliant": 4,
  "breathtaking": 4, "magnificent": 4, "masterpiece": 4, "exquisite": 4, "phenomenal": 4,
  "love": 3, "loved": 3, "loving": 3, "loves": 3, "excellent": 3, "amazing": 3,
  "wonderful": 3, "fantastic": 3, "awesome": 3, "great": 3, "delight": 3, "delighted": 3,
  "delightful": 3, "ecstatic": 4, "thrilled": 4, "glorious": 3, "perfect": 3, "perfection": 4,
  "innovative": 3, "revolutionary": 3, "triumph": 3, "triumphant": 3, "celebrate": 3,
  "good": 2, "nice": 2, "happy": 3, "pleased": 2, "satisfied": 2, "satisfying": 2,
  "impressive": 3, "impressed": 3, "valuable": 2, "helpful": 2, "beneficial": 2,
  "seamless": 3, "smooth": 2, "intuitive": 2, "reliable": 3, "solid": 2, "robust": 2,
  "efficient": 2, "fast": 2, "responsive": 2, "clean": 2, "elegant": 3, "sleek": 2,
  "enjoy": 2, "enjoyed": 2, "enjoyable": 2, "favorite": 3, "recommend": 2, "recommended": 2,
  "worthwhile": 2, "gem": 3, "stellar": 3, "premium": 2, "rich": 1, "useful": 2,
  "appreciate": 2, "appreciated": 2, "appreciation": 2, "honor": 2, "honored": 2,
  "optimistic": 2, "hopeful": 2, "inspire": 3, "inspired": 3, "inspiring": 3,
  "trusted": 3, "trust": 2, "trustworthy": 3, "safe": 2, "secure": 2, "confidence": 2,
  "confident": 2, "comfort": 2, "comfortable": 2, "glad": 2, "cheerful": 2, "friendly": 2,
  "kind": 2, "courteous": 2, "polite": 2, "respect": 2, "respected": 2, "generous": 2,
  "clarity": 2, "clear": 1, "effective": 2, "productive": 2, "progress": 2, "prosper": 3,
  "thrive": 3, "victory": 3, "win": 2, "winning": 2, "winner": 2, "success": 3,
  "successful": 3, "flourish": 3, "admire": 3, "admired": 3, "cheer": 2, "proud": 2,
  "pride": 2, "grace": 2, "graceful": 2, "blessing": 3, "blessed": 3, "heavenly": 4,
  "miracle": 4, "top-tier": 3, "first-class": 3, "unmatched": 3, "superior": 3, "genius": 4,
  "positive": 2, "positivity": 2, "bright": 2, "uplifting": 3, "rejuvenated": 3, "calm": 2,
  "peaceful": 2, "refreshing": 2, "neat": 2, "vibrant": 2, "alive": 2, "eager": 2,

  // Mild positive (1)
  "fine": 1, "okay": 1, "ok": 1, "decent": 1, "adequate": 1, "fair": 1, "passable": 1,
  "acceptable": 1, "tolerable": 1, "functional": 1, "usable": 1, "standard": 1, "proper": 1,
  "neatly": 1, "fitting": 1, "sufficient": 1, "steady": 1, "stable": 1,

  // Negative valence words (-1 to -5)
  "horrible": -4, "terrible": -4, "disastrous": -4, "catastrophic": -5, "abysmal": -4,
  "atrocious": -4, "dreadful": -4, "appalling": -4, "worst": -4, "hated": -4, "hate": -3,
  "awful": -3, "garbage": -4, "trash": -4, "scam": -5, "fraud": -5, "rip-off": -4,
  "ripoff": -4, "useless": -3, "worthless": -4, "pathetic": -4, "disgusting": -4,
  "revolting": -4, "nauseating": -4, "unacceptable": -3, "abhorrent": -4,
  "bad": -2, "poor": -2, "disappointing": -2, "disappointed": -2, "disappointment": -3,
  "broken": -2, "buggy": -2, "crash": -2, "crashed": -2, "crashing": -3, "error": -2,
  "fail": -2, "failed": -2, "failure": -3, "failing": -2, "slow": -2, "sluggish": -2,
  "laggy": -2, "lag": -2, "frustrating": -3, "frustrated": -3, "frustration": -3,
  "annoying": -2, "annoyed": -2, "irritating": -2, "irritated": -2, "infuriating": -4,
  "rage": -4, "angry": -3, "anger": -3, "furious": -4, "mad": -2, "upset": -2,
  "confusing": -2, "confused": -2, "confusion": -2, "complicated": -2, "clunky": -2,
  "cumbersome": -2, "messy": -2, "mess": -2, "ruined": -3, "ruin": -3, "ruining": -3,
  "flawed": -2, "defect": -2, "defective": -3, "glitch": -2, "glitchy": -2, "unstable": -2,
  "insecure": -3, "vulnerable": -2, "danger": -3, "dangerous": -3, "harmful": -3,
  "toxic": -3, "hostile": -3, "rude": -3, "unhelpful": -2, "neglect": -3, "neglected": -3,
  "deceptive": -3, "misleading": -3, "cheat": -3, "cheated": -3, "liar": -4, "lie": -3,
  "drain": -2, "draining": -2, "pain": -2, "painful": -3, "nightmare": -4, "headache": -2,
  "sad": -2, "sadness": -2, "depressing": -3, "depressed": -3, "sorrow": -3, "grief": -3,
  "ugly": -2, "regret": -2, "regretted": -2, "regretful": -2, "waste": -3, "wasted": -3,
  "expensive": -1, "overpriced": -3, "costly": -2, "greedy": -3, "greed": -3, "lack": -2,
  "lacking": -2, "missing": -2, "lost": -2, "lose": -2, "loser": -3, "loss": -2,
  "inferior": -2, "shoddy": -3, "subpar": -2, "mediocre": -2, "dull": -1, "boring": -2,
  "tedious": -2, "monotonous": -2, "exhausting": -2, "exhausted": -2, "stress": -2,
  "stressful": -3, "panic": -3, "scared": -2, "fear": -2, "terrifying": -3, "dread": -3,
  "shame": -3, "embarrassing": -2, "embarrassed": -2, "sucks": -3, "suck": -3, "terribly": -3,
  "victim": -2, "vandalism": -3, "reject": -2, "rejected": -2, "denied": -2, "cancel": -1,
  "cancelled": -1, "stuck": -2, "freeze": -2, "frozen": -2, "brick": -3, "bricked": -4
};

// Common Emoji sentiments
export const EMOJI_SENTIMENT: Record<string, number> = {
  "🔥": 3, "❤️": 3, "💖": 3, "✨": 2, "🚀": 3, "👏": 2, "👍": 2, "🙌": 3, "🎉": 3,
  "😍": 4, "🥰": 4, "🤩": 4, "😊": 2, "😃": 2, "🥳": 3, "💯": 3, "💎": 3, "⭐": 2,
  "👌": 2, "💪": 2, "😎": 2, "🏆": 3, "👑": 3, "💡": 2, "🎯": 2, "✅": 2,
  "👎": -2, "💔": -3, "💩": -3, "😡": -3, "🤬": -4, "🤮": -4, "🤢": -3, "😢": -2,
  "😭": -2, "😤": -2, "🤦": -2, "🤦‍♂️": -2, "🤦‍♀️": -2, "🙄": -2, "😴": -1, "🥱": -1,
  "🤡": -3, "⚠️": -1, "❌": -2, "💀": -2, "🚨": -2, "💸": -2
};

// Valence Boosters (intensifiers that multiply subsequent sentiment word by factor)
export const INTENSIFIERS: Record<string, number> = {
  "extremely": 1.6,
  "incredibly": 1.6,
  "absolutely": 1.5,
  "exceptionally": 1.5,
  "completely": 1.4,
  "totally": 1.4,
  "hugely": 1.4,
  "immensely": 1.5,
  "tremendously": 1.5,
  "remarkably": 1.4,
  "very": 1.35,
  "really": 1.3,
  "so": 1.25,
  "super": 1.35,
  "ultra": 1.4,
  "extraordinarily": 1.5,
  "insanely": 1.4,
  "wildly": 1.3,
  "deeply": 1.35,
  "highly": 1.3,
  "vastly": 1.3,
  "substantially": 1.25,
  "truly": 1.25,
  "unbelievably": 1.5,
  "unquestionably": 1.4,
  "undeniably": 1.4
};

// Valence Diminishers
export const DIMINISHERS: Record<string, number> = {
  "slightly": 0.6,
  "somewhat": 0.65,
  "barely": 0.5,
  "hardly": 0.45,
  "scarcely": 0.5,
  "a little": 0.7,
  "a bit": 0.7,
  "marginally": 0.6,
  "fairly": 0.8,
  "kind of": 0.75,
  "kinda": 0.75,
  "sort of": 0.75,
  "moderately": 0.8,
  "partially": 0.7
};

// Negation words that flip polarity
export const NEGATIONS = new Set([
  "not", "never", "no", "n't", "cannot", "cant", "can't", "wont", "won't",
  "hardly", "barely", "scarcely", "without", "rarely", "neither", "nor",
  "nowhere", "nothing", "none", "despite", "doesn't", "doesnt", "don't", "dont",
  "didn't", "didnt", "isn't", "isnt", "aren't", "arent", "wasn't", "wasnt",
  "weren't", "werent", "haven't", "havent", "hasn't", "hasnt", "hadn't", "hadnt"
]);

// Idioms & multi-word expressions with specific fixed scores
export const IDIOM_LEXICON: Record<string, number> = {
  "over the moon": 4,
  "blow away": 3,
  "blown away": 3.5,
  "state of the art": 3,
  "top of the line": 3,
  "second to none": 3.5,
  "game changer": 3.5,
  "out of this world": 4,
  "piece of cake": 2.5,
  "breath of fresh air": 3,
  "gold standard": 3.5,
  "up to standard": 1.5,
  "down in the dumps": -3,
  "slap in the face": -3.5,
  "waste of money": -4,
  "waste of time": -4,
  "pain in the neck": -3,
  "pain in the ass": -4,
  "fallen short": -2.5,
  "falls short": -2.5,
  "leave a bad taste": -3,
  "out of order": -2,
  "broken down": -3,
  "cost an arm and a leg": -3,
  "last resort": -2,
  "dead on arrival": -4,
  "train wreck": -4,
  "under the weather": -2
};

// Emotion Lexicon Associations (Word -> Emotion Vector)
export const EMOTION_MAP: Record<string, Partial<Record<"joy" | "trust" | "sadness" | "anger" | "surprise" | "fear" | "disgust", number>>> = {
  // Joy
  "love": { joy: 0.9, trust: 0.7 },
  "delighted": { joy: 0.9, surprise: 0.4 },
  "ecstatic": { joy: 1.0, surprise: 0.6 },
  "happy": { joy: 0.8, trust: 0.5 },
  "celebrate": { joy: 0.85 },
  "triumph": { joy: 0.9, trust: 0.6 },
  "awesome": { joy: 0.8, surprise: 0.5 },
  "wonderful": { joy: 0.85, trust: 0.6 },
  "fantastic": { joy: 0.85, surprise: 0.4 },
  "thrilled": { joy: 0.95, surprise: 0.7 },
  "pleased": { joy: 0.6, trust: 0.6 },
  "enjoy": { joy: 0.7 },
  "smile": { joy: 0.7 },
  "peaceful": { joy: 0.5, trust: 0.8 },
  "glorious": { joy: 0.9, surprise: 0.5 },
  
  // Trust
  "reliable": { trust: 0.9 },
  "secure": { trust: 0.9, fear: -0.5 },
  "honest": { trust: 0.95 },
  "recommend": { trust: 0.85, joy: 0.5 },
  "safe": { trust: 0.85 },
  "trusted": { trust: 1.0 },
  "consistent": { trust: 0.8 },
  "stable": { trust: 0.8 },
  "authentic": { trust: 0.9 },
  "guarantee": { trust: 0.85 },
  "expert": { trust: 0.85 },
  "proven": { trust: 0.85 },
  
  // Sadness
  "sad": { sadness: 0.9 },
  "depressed": { sadness: 0.95 },
  "disappointed": { sadness: 0.8, anger: 0.4 },
  "grief": { sadness: 1.0 },
  "sorrow": { sadness: 0.9 },
  "heartbroken": { sadness: 0.95, anger: 0.3 },
  "lonely": { sadness: 0.7, fear: 0.4 },
  "regret": { sadness: 0.75 },
  "hopeless": { sadness: 0.9, fear: 0.6 },
  "loss": { sadness: 0.8 },
  "wasted": { sadness: 0.6, anger: 0.5 },
  
  // Anger
  "furious": { anger: 1.0 },
  "angry": { anger: 0.9 },
  "infuriating": { anger: 0.95, disgust: 0.6 },
  "scam": { anger: 0.9, disgust: 0.9, trust: -0.9 },
  "fraud": { anger: 0.85, disgust: 0.85 },
  "rip-off": { anger: 0.9, disgust: 0.7 },
  "rage": { anger: 1.0 },
  "hate": { anger: 0.85, disgust: 0.8 },
  "annoyed": { anger: 0.6 },
  "irritating": { anger: 0.7 },
  "unacceptable": { anger: 0.75, disgust: 0.5 },
  "cheated": { anger: 0.9, sadness: 0.5 },
  
  // Surprise
  "astonishing": { surprise: 0.95, joy: 0.5 },
  "shocking": { surprise: 0.9, fear: 0.6 },
  "unexpected": { surprise: 0.8 },
  "unbelievable": { surprise: 0.85 },
  "sudden": { surprise: 0.7 },
  "miracle": { surprise: 0.9, joy: 0.9 },
  "stunning": { surprise: 0.85, joy: 0.8 },
  "phenomenal": { surprise: 0.8, joy: 0.9 },
  
  // Fear
  "terrifying": { fear: 0.95 },
  "scared": { fear: 0.85 },
  "danger": { fear: 0.9 },
  "dangerous": { fear: 0.85 },
  "vulnerable": { fear: 0.75, trust: -0.6 },
  "panic": { fear: 0.95, surprise: 0.5 },
  "threat": { fear: 0.9 },
  "worry": { fear: 0.7, sadness: 0.5 },
  "anxious": { fear: 0.8 },
  "alarm": { fear: 0.8, surprise: 0.6 },

  // Disgust
  "disgusting": { disgust: 0.95, anger: 0.5 },
  "revolting": { disgust: 1.0 },
  "nauseating": { disgust: 0.95 },
  "filthy": { disgust: 0.85 },
  "pathetic": { disgust: 0.8, anger: 0.6 },
  "trash": { disgust: 0.8, anger: 0.6 },
  "garbage": { disgust: 0.8, anger: 0.6 },
  "repulsive": { disgust: 0.95 }
};

// Aspect Taxonomy Definitions for Aspect-Based Sentiment Analysis (ABSA)
export interface AspectCategory {
  id: string;
  name: string;
  keywords: string[];
}

export const ASPECT_CATEGORIES: AspectCategory[] = [
  {
    id: "product_quality",
    name: "Product & Build Quality",
    keywords: [
      "quality", "material", "build", "durability", "durable", "sturdy", "flimsy",
      "craftsmanship", "finish", "defect", "solid", "hardware", "screen", "battery",
      "chassis", "camera", "feel", "component", "parts", "packaging"
    ]
  },
  {
    id: "usability_ux",
    name: "Usability & Interface",
    keywords: [
      "ui", "ux", "interface", "design", "navigation", "intuitive", "easy", "simple",
      "clunky", "confusing", "learning curve", "layout", "workflow", "setup", "install",
      "onboarding", "ergonomic", "accessible", "user-friendly", "clean"
    ]
  },
  {
    id: "performance_speed",
    name: "Performance & Reliability",
    keywords: [
      "speed", "fast", "slow", "lag", "latency", "responsive", "crash", "bug",
      "glitch", "uptime", "reliable", "loading", "efficient", "powerful", "performance",
      "battery life", "memory", "battery", "stable", "boot", "fps", "overheating"
    ]
  },
  {
    id: "customer_support",
    name: "Customer Service & Support",
    keywords: [
      "support", "service", "helpdesk", "rep", "representative", "agent", "ticket",
      "response time", "refund", "return", "warranty", "courteous", "rude", "assistance",
      "call center", "email support", "chat support", "resolution", "staff"
    ]
  },
  {
    id: "pricing_value",
    name: "Pricing & Value",
    keywords: [
      "price", "cost", "pricing", "expensive", "cheap", "value", "worth", "deal",
      "subscription", "billing", "affordable", "overpriced", "roi", "discount",
      "charge", "fee", "free", "money", "tier", "plan"
    ]
  },
  {
    id: "features_capability",
    name: "Features & Capabilities",
    keywords: [
      "feature", "capability", "functionality", "tool", "integration", "export", "import",
      "sync", "automation", "customization", "option", "setting", "api", "ai",
      "reporting", "filter", "search", "sharing", "collaboration"
    ]
  }
];

// Tone indicators
export const TONE_KEYWORDS = {
  constructive: ["suggest", "improve", "potential", "could", "feedback", "roadmap", "recommend", "consider", "better if", "tweak", "alternative"],
  urgent: ["urgent", "immediately", "asap", "critical", "blocking", "halted", "showstopper", "emergency", "fatal", "now", "deadline"],
  formal: ["furthermore", "consequently", "regarding", "hereby", "pursuant", "therefore", "nevertheless", "accordingly", "facilitate", "inquire"],
  enthusiastic: ["excited", "blown away", "cannot wait", "huge fan", "game changer", "revolutionary", "masterpiece", "outstanding", "incredible", "hyped"],
  skeptical: ["alleged", "supposedly", "questionable", "doubtful", "unlikely", "curious", "claims", "unconvinced", "dubious", "overhyped"]
};
