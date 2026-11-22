#include "tree_sitter/parser.h"
#include <wctype.h>
// Block comment stuff here is largely nicked from tree-sitter-rust https://github.com/tree-sitter/tree-sitter-rust

enum TokenType { 
  BLOCK_COMMENT,
  // STRING,
  SPACE_SEPARATOR,
  GENERATOR_ARROW,  // <- for list comprehensions
  EVENT_KEY         // identifier: for event literals
};

void *tree_sitter_supercollider_external_scanner_create() { return NULL; }
void tree_sitter_supercollider_external_scanner_destroy(void *p) {}
void tree_sitter_supercollider_external_scanner_reset(void *p) {}
unsigned tree_sitter_supercollider_external_scanner_serialize(void *p, char *buffer) { return 0; }
void tree_sitter_supercollider_external_scanner_deserialize(void *p, const char *b, unsigned n) {}

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static bool is_num_char(int32_t c) { return c == '_' || iswdigit(c); }

static bool is_identifier_start(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';
}

static bool is_identifier_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || 
         (c >= '0' && c <= '9') || c == '_';
}

bool tree_sitter_supercollider_external_scanner_scan(
  void *payload, TSLexer *lexer, const bool *valid_symbols) {

  // space as separator in '{ |arg1 arg2| }' style argument declaration
  if (valid_symbols[SPACE_SEPARATOR] && iswspace(lexer->lookahead)) {
    while (iswspace(lexer->lookahead))
      lexer->advance(lexer, true);
    if (lexer->lookahead != '=' && lexer->lookahead != '|') {
      lexer->result_symbol = SPACE_SEPARATOR;
      return true;
    }
  }

  while (iswspace(lexer->lookahead))
    lexer->advance(lexer, true);

  // Event key: identifier followed by colon (e.g., "freq:" or "amp :")
  // Allows optional whitespace between identifier and colon
  // This must be checked when EVENT_KEY is valid to distinguish from unary :
  if (valid_symbols[EVENT_KEY] && is_identifier_start(lexer->lookahead)) {
    lexer->mark_end(lexer);
    
    // Consume the identifier
    while (is_identifier_char(lexer->lookahead)) {
      advance(lexer);
    }
    
    // Skip optional whitespace before colon (space/tab only, not newline)
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
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
