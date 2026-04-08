/**
 * Lightweight topic shift detection — pure heuristic, no LLM.
 */

const STOP_WORDS = new Set(["the", "is", "a", "an", "to", "and", "or", "of", "in", "for", "on", "it", "this", "that", "with", "be", "as", "at", "by", "from", "was", "are", "been", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "can", "may", "might", "i", "you", "we", "they", "he", "she", "my", "your", "our"]);
// Future: detect retrieval triggers like "remember when", "what did we before"

export interface TopicState {
  currentTopic: string;
  topicKeywords: string[];
  topicStartedAt: number;
  topicShiftDetected: boolean;
  previousTopic?: string;
}

export class TopicTracker {
  private state: TopicState = {
    currentTopic: "",
    topicKeywords: [],
    topicStartedAt: 0,
    topicShiftDetected: false,
  };
  private messagesSinceLast = 0;
  private reRetrieveEveryN: number;

  constructor(reRetrieveEveryN = 10) {
    this.reRetrieveEveryN = reRetrieveEveryN;
  }

  analyzeMessage(message: string, messageIndex: number): TopicState {
    const keywords = extractKeywords(message);
    this.messagesSinceLast++;

    if (this.state.topicKeywords.length === 0) {
      // First message — set initial topic
      this.state.currentTopic = keywords.slice(0, 5).join(" ");
      this.state.topicKeywords = keywords;
      this.state.topicStartedAt = messageIndex;
      this.state.topicShiftDetected = false;
      return { ...this.state };
    }

    const similarity = jaccardSimilarity(
      new Set(this.state.topicKeywords),
      new Set(keywords),
    );

    if (similarity < 0.3) {
      // Topic shift
      this.state.previousTopic = this.state.currentTopic;
      this.state.currentTopic = keywords.slice(0, 5).join(" ");
      this.state.topicKeywords = keywords;
      this.state.topicStartedAt = messageIndex;
      this.state.topicShiftDetected = true;
      this.messagesSinceLast = 0;
    } else {
      // Same or related topic — merge keywords
      const merged = new Set([...this.state.topicKeywords, ...keywords]);
      this.state.topicKeywords = [...merged].slice(0, 20);
      this.state.topicShiftDetected = false;
    }

    return { ...this.state };
  }

  getCurrentTopic(): TopicState {
    return { ...this.state };
  }

  shouldReRetrieve(): boolean {
    if (this.state.topicShiftDetected) return true;
    if (this.messagesSinceLast >= this.reRetrieveEveryN) {
      this.messagesSinceLast = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.state = { currentTopic: "", topicKeywords: [], topicStartedAt: 0, topicShiftDetected: false };
    this.messagesSinceLast = 0;
  }
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.:;!?()[\]{}"'`]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 15);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
