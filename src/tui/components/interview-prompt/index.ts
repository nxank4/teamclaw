/**
 * Public surface of the interview-prompt component — pure renderer +
 * pure parser, no TUI dependencies beyond Theme. The prompt-handler
 * imports `renderQuestion` to push a question into the chat stream,
 * then routes the next user input through `parseAnswer`.
 */

export {
  INTERVIEW_MESSAGE_TAG,
  renderQuestion,
  type QuestionPosition,
} from "./renderer.js";

export {
  parseAnswer,
  type ParseResult,
} from "./parser.js";
