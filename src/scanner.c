#include "tree_sitter/parser.h"
#include <string.h>
#include <wctype.h>
// Block comment stuff here is largely nicked from tree-sitter-rust https://github.com/tree-sitter/tree-sitter-rust

enum TokenType {
  BLOCK_COMMENT,
  GENERATOR_ARROW,  // <- for list comprehensions
  EVENT_KEY,        // identifier: for event literals
  STRING_CONTENT,   // a string's text, up to its closing quote or a backslash
  ERROR_SENTINEL,   // never produced: valid only while an error is recovered
  PIPE_TOKEN,       // | with no operator character directly after it
  EQUALS            // = with no operator character directly after it
};

// What sclang's lexer reads as part of an operator (PyrLexer.cpp, binopchars).
static bool is_operator_char(int32_t c) {
  return c != 0 && c < 128 && strchr("!@%&*-+=|<>?/", c) != NULL;
}

void *tree_sitter_supercollider_external_scanner_create() { return NULL; }
void tree_sitter_supercollider_external_scanner_destroy(void *p) {}
void tree_sitter_supercollider_external_scanner_reset(void *p) {}
unsigned tree_sitter_supercollider_external_scanner_serialize(void *p, char *buffer) { return 0; }
void tree_sitter_supercollider_external_scanner_deserialize(void *p, const char *b, unsigned n) {}

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static bool is_identifier_start(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';
}

static bool is_identifier_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || 
         (c >= '0' && c <= '9') || c == '_';
}

bool tree_sitter_supercollider_external_scanner_scan(
  void *payload, TSLexer *lexer, const bool *valid_symbols) {

  // Inside a string all there is, up to the closing quote or a backslash, is
  // its text: blanks are not skipped, and `/*` opens no comment. While
  // tree-sitter recovers from an error it offers every token at once, the
  // sentinel too, and then this is not to be believed.
  if (valid_symbols[STRING_CONTENT] && !valid_symbols[ERROR_SENTINEL]) {
    bool any = false;
    while (lexer->lookahead != '"' && lexer->lookahead != '\\' && !lexer->eof(lexer)) {
      advance(lexer);
      any = true;
    }
    lexer->result_symbol = STRING_CONTENT;
    return any;
  }

  while (iswspace(lexer->lookahead))
    lexer->advance(lexer, true);

  // A pipe, or an equals sign, when no operator character follows it
  // directly. sclang's lexer reads a run of operator characters as one
  // operator wherever it stands, so `|-` and `=-` are operators, and `|/*`
  // too: no comment opens in the middle of a run. Where the grammar wants a
  // pipe or an equals sign such a run is an error, as it is to sclang.
  if ((valid_symbols[PIPE_TOKEN] && lexer->lookahead == '|') ||
      (valid_symbols[EQUALS] && lexer->lookahead == '=')) {
    enum TokenType token = lexer->lookahead == '|' ? PIPE_TOKEN : EQUALS;
    advance(lexer);
    if (is_operator_char(lexer->lookahead))
      return false;
    lexer->mark_end(lexer);
    lexer->result_symbol = token;
    return true;
  }

  // Event key: an identifier with its colon directly after it (`freq:`),
  // which is one token to sclang (KEYBINOP) and names a symbol. With a blank
  // between them (`freq : 1`) the name is a variable and the colon stands
  // alone, so that is not one of these.
  if (valid_symbols[EVENT_KEY] && is_identifier_start(lexer->lookahead)) {
    lexer->mark_end(lexer);

    // Consume the identifier
    while (is_identifier_char(lexer->lookahead)) {
      advance(lexer);
    }

    // Check for colon
    if (lexer->lookahead == ':') {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = EVENT_KEY;
      return true;
    }
    
    // Not followed by colon, don't consume
    return false;
  }

  // Generator arrow <- for list comprehensions
  // Only match when GENERATOR_ARROW is a valid symbol (parser context)
  // This prevents matching <- inside strings or other invalid contexts
  if (valid_symbols[GENERATOR_ARROW] && lexer->lookahead == '<') {
    advance(lexer);
    if (lexer->lookahead == '-') {
      advance(lexer);
      // A longer run of operator characters is an operator: `a <-- b`.
      if (is_operator_char(lexer->lookahead))
        return false;
      lexer->mark_end(lexer);
      lexer->result_symbol = GENERATOR_ARROW;
      return true;
    }
    // Just <, not <- - let normal lexer handle by returning false
    // Tree-sitter will reset the lexer state
    return false;
  }

  if (lexer->lookahead == '/') {
    advance(lexer);
    if (lexer->lookahead != '*')
      return false;
    advance(lexer);

    bool after_star = false;
    unsigned nesting_depth = 1;
    for (;;) {
      switch (lexer->lookahead) {
      case '\0':
        return false;
	  /* case '"': */
		/* lexer->result_symbol = STRING; */
		/* break; */
      case '*':
        advance(lexer);
        after_star = true;
        break;
      case '/':
        if (after_star) {
          advance(lexer);
          after_star = false;
          nesting_depth--;
          if (nesting_depth == 0) {
            lexer->result_symbol = BLOCK_COMMENT;
            return true;
          }
        } else {
          advance(lexer);
          after_star = false;
          if (lexer->lookahead == '*') {
            nesting_depth++;
            advance(lexer);
          }
        }
        break;
      default:
        advance(lexer);
        after_star = false;
        break;
      }
    }
  }

  return false;
}
