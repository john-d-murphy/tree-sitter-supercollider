// grammar.js - SuperCollider tree-sitter grammar
//
// DESIGN DECISIONS:
//
// 1. KEYWORDS vs FUNCTIONS WITH TRAILING BLOCKS
//    SuperCollider has true control structures (if, while, for, switch, case)
//    that have special syntax. These ARE defined as grammar keywords.
//
//    However, many SC functions simply take a trailing block argument:
//      loop { }, fork { }, bench { }, protect { }, try { }, defer { }, etc.
//
//    These must NOT be grammar keywords because they're also valid as:
//      - Named arguments:  PlayBuf.ar(buf, loop: 1)
//      - Method names:     myObject.loop
//      - Variables:        var loop = 5
//
//    They parse correctly via function_call's trailing block syntax.
//
//    NOTE: Classes like Routine, Task cannot use trailing block syntax directly
//    because Class { } conflicts with class definitions. Use Class.new { } instead,
//    or the Class(...) call syntax.
//
// 2. THE # SYMBOL
//    # has two meanings that must be disambiguated:
//      - Literal array:  #[1, 2, 3]  (# followed by [)
//      - Destructuring:  #a, b = arr  (# followed by identifier)
//    The grammar handles this via the collection and destructuring_assignment
//    rules, which have different lookahead requirements.
//
// 3. BINARY OPERATORS
//    Operators are listed longest-first within each precedence group to ensure
//    correct lexing (e.g., === before ==, +++ before ++, <<< before <<).
//
// 4. THE <> SYMBOL
//    <> has multiple meanings by context:
//      - Getter+setter modifier:  var <>x = 0  (in class/var declarations)
//      - Function composition:    f <> g      (binary operator)
//    Context disambiguates: the modifier only appears after var/classvar keywords.
//
// 5. MUSICAL NOTATION
//    Accidentals in degree notation: 1b (flat), 5s (sharp)
//    These are parsed as the `accidental` rule within numbers.
//
// 6. LIST COMPREHENSIONS
//    {: body, qualifiers } syntax where qualifiers include:
//      - x <- collection    (generator)
//      - var z = expr       (binding)
//      - :: expr            (side effect)
//      - condition          (filter)
//    Can be used with trailing syntax: all {: x, x <- (1..10) }
//
// 7. ARITHMETIC SERIES
//    Supports various range syntaxes:
//      - (start..end)       simple range
//      - (start,step..end)  range with step
//      - (start..)          open-ended (infinite)
//      - (start,step..)     open-ended with step
//      - (..end)            from beginning
//

const PRECEDENCE = {
  comment: 1000,
  pipe_params: 5,
  association: 11,
  associative_item: 10,
  stringConcat: 16,
  partial: 15,
  call: 14,
  field: 13,
  unary: 15,
  duplication: 12,
  multiplicative: 10,
  additive: 9,
  shift: 8,
  bitand: 7,
  bitxor: 6,
  bitor: 5,
  comparative: 4,
  and: 3,
  or: 2,
  compose: 2,
  range: 1,
  indexing: 1,
  assign: 0,
  selectorBinary: 100,
  controlstruct: 3,
  localvar: 4,
  vardef: 3,
  vardef_sequence: 10,
  closure: -1,
  class_def: 1,
  class: 20,
  code_block: 20,
};

// A binary operator, as sclang's lexer reads one (PyrLexer.cpp, binopchars):
// any run of these characters, whatever it spells. `a <--> b` and `a *- b`
// are each one operator, and a run that begins with a slash is an operator
// unless the slash opens a comment. The operators the grammar names one by
// one below are runs too; where both fit the same text the name wins, and a
// longer run is always this.
const OPERATOR = /([!@%&*\-+=|<>?]|\/[!@%&\-+=|<>?])[!@%&*\-+=|<>?\/]*|\//;

// What an identifier is made of.
const NAME = /(r#)?[a-zA-Zα-ωΑ-Ωµ_][a-zA-Zα-ωΑ-Ωµ\d_]*/;

// sclang reserves none of the names of its control structures: `arg for;`
// declares a variable like any other, and `for` then reads it.
const CONTROL_NAMES = [
  "if",
  "while",
  "for",
  "forBy",
  "case",
  "switch",
  "protect",
  "try",
];

// The name of a variable or an argument, where it is declared or read.
function name($) {
  return choice(
    $.identifier,
    ...CONTROL_NAMES.map(word => alias(word, $.identifier)),
  );
}

// The name a method is defined by: an identifier or, for a binary operator's
// method (`== { |other| ... }`), the operator.
function methodName($) {
  return choice(
    $.identifier,
    // a one-letter name is its own token (an interpreter variable, where an
    // expression can be)
    /[a-z]/,
    ...CONTROL_NAMES,
    operatorName($),
  );
}

// The value of an argument or of a list's element: `a; b; c` evaluates all
// and is worth the last, and a semicolon may close it.
function expressionSequence($) {
  return seq($._object, repeat(seq(";", $._object)), optional(";"));
}

// `#[1, 2]`, `#Array[1, 2]`: an array made when the code is compiled.
function literalArray($) {
  return seq(
    "#",
    optional(alias($.class, $.collection_type)),
    "[",
    optional($._collection_sequence),
    "]",
  );
}

// The blocks that may follow a call, each a function or a list
// comprehension and each one more argument to it (lang11d: blocklist1):
// `f(a) { 1 } { 2 }`. The first is the field `block` or `comprehension`.
function blockList($) {
  return seq(
    choice(
      field("block", $.function_block),
      field("comprehension", $.list_comprehension),
    ),
    repeat(choice($.function_block, $.list_comprehension)),
  );
}

// An operator where a name is wanted: a method's name in a class, a callee
// in parentheses. The ones listed are tokens of their own where an
// expression or a function's arguments may begin.
function operatorName($) {
  return choice(
    $._operator,
    "*",
    "-",
    "!",
    $.pipe_token,
    "<",
    ">",
    "<>",
  );
}

// A part of a series: the start, the step or the end.
function seriesPart($) {
  return seq(
    repeat(seq($._object, ";")),
    $._numeric_expression,
    optional(";"),
  );
}

function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}

function sepBy(sep, rule) {
  return optional(sepBy1(sep, rule));
}

module.exports = grammar({
  name: "supercollider",

  // Ignore whitespace and comments
  extras: $ => [/\s/, $.line_comment, $.block_comment],

  externals: $ => [
    $.block_comment,
    $._space_separator,
    $.generator_arrow, // <- for list comprehensions, needs external scanner
    $.event_key, // identifier: for event literals
    $._string_content, // a string's text: no comment opens inside it
    $._error_sentinel, // never used: valid only while an error is recovered
  ],

  // The name of a token that will match keywords for the purpose of the keyword extraction optimization.
  word: $ => $.identifier,

  conflicts: $ => [
    // [$.source_file, $._object],
    // Base ambiguity: code_block is both an _expression and an _object.
    [$._expression, $._object],

    // Numeric vs literal vs object
    [$.literal, $._numeric_expression],

    // When function_call / number / variable overlap numeric atoms vs objects
    [$._object, $._numeric_expression],

    // function_call used as both _object and _indexable_object
    // [$._object, $._indexable_object],

    // duplication / if / calls
    [$.duplicated_statement, $.function_call, $.if, $.while],
    [$.function_call, $.binary_expression, $.if, $.while],
    // internal repetition ambiguity in indexed_collection
    // [$.indexed_collection],

    // pi with optional coefficient (2pi, 0.5pi, etc.)
    // [$.pi_statement, $.number],

    // string can be both a literal and an indexable object
    // [$.literal, $._indexable_object],

    // block-style vs surrounding expression / nested switch
    // [$.switch],

    // [$.binary_expression, $.pipe_argument],
    // Add this line:
    [$._object, $._pipe_safe_expression],
    [$._expression_statement, $._object],
    [$.instance_var, $.var_binding],

    // List comprehension: generator (x <- ...) vs filter (any _object)
    [$.comprehension_generator, $.comprehension_filter],
    // List comprehension: binding (var x = ...) vs filter (any _object starting with var)
    [$.comprehension_binding, $.comprehension_filter],
    // List comprehension binding vs instance_var (both can be: var identifier ...)
    [$.comprehension_binding, $.instance_var],

    // Class definition: bare identifier in class body could be instance_var declaration
    // or a variable reference in an expression
    [$.variable, $.class_def],

    // At the top of a file `Foo { a { ^1 } }` is a class with a method, and
    // `Routine { loop { 1.wait } }.play` is a call with a block. Which it is
    // may not show until the closing brace, so both are followed.
    [$.class_def, $.function_call],

    // `Array[slot] : ArrayedCollection { ... }` opens a class, and `Array[item]`
    // is a list of one item: followed as far as it takes to tell.
    [$.local_var, $.instance_var, $.class_def],

    // A line of variables that ends a file is one of the file's lines or its
    // final expression.
    [$.source_file, $._expression_statement],

    // Event vs code_block: (key: value) is event, (expr; expr) is code_block
    [$.event, $.code_block],

    // expr.if(func, func) vs expr.if(obj, obj)
    [$._object, $.if],

    // A control structure's name may be called like any other name
    // (`if(a)`, `for { a }`, `x.if(a)`, `3.for(7) { }`): its own rule and
    // the plain call are both followed, and where both fit to the end, its
    // own rule is taken (the plain call's dynamic precedence is the lower).
    [$.unnamed_argument, $.if],
    [$.unnamed_argument, $.for],
    [$.unnamed_argument, $.forby],
    [$.unnamed_argument, $.case],
    [$.unnamed_argument, $.switch],
    [$.unnamed_argument, $.protect],
    [$.unnamed_argument, $.try],
    [$.function_call, $.while],
    [$.function_call, $.protect],
    [$.function_call, $.try],
    [$.method_call, $.if],
    // `3.for(7, { })` is the for rule's and `3.format` a method call: the
    // integer is the rule's own or a number, as what follows the dot says.
    [$.number, $.for, $.forby],

    // `(a; b)` is statements, `(a; b : c)` a dictionary keyed by an
    // expression and `(a; b .. c)` a series: which it is shows only at the
    // colon or the two dots.
    [$._expression_statement, $.associative_item, $.arithmetic_series],
    [$.associative_item, $.arithmetic_series],
    [$.ref_expression, $.associative_item, $.arithmetic_series],
  ],

  rules: {
    //// Define the token explicitly so we can refer to it by ID
    // source_file: $ =>
    //  optional(
    //    // Small precedence bump so this wins over low-precedence noise.
    //    prec.left(1, $._expression_sequence),
    //  ),

    source_file: $ =>
      optional(
        seq(
          // Interpreted code is the body of a function, and may open with
          // that function's arguments: `arg a; a + 1` (lang11d: cmdlinecode)
          optional(field("params", $.parameter_list)),
          repeat(
            choice(
              // A semicolon-terminated expression
              seq($._expression, ";"),
              // A line of variables ends with a semicolon of its own, and
              // code may follow it. Where it is the last thing in a file
              // it is also the final expression below, and `var x = 1;` is
              // also an expression and its semicolon: both are followed
              // (see the conflicts), and the dynamic precedence leaves a
              // file that parsed without this reading the tree it had.
              prec.dynamic(-1, $.variable_definition_sequence),
              // A class definition or extension needs no semicolon after it:
              // a class file is one after another with nothing between. The
              // precedence settles a file that ends with one: it is this, not
              // the final expression below.
              prec(1, $.class_def),
            ),
          ),
          // Optional final expression (no semicolon required)
          optional($._expression),
        ),
      ),

    // A class definition is not one of these: it stands only at the top of a
    // file (source_file). Anywhere an expression can be, `Routine { ... }` is
    // a call with a block.
    _expression: $ =>
      choice(
        $.function_block,
        $._expression_statement,
      ),

    _expression_statement: $ =>
      choice(
        $.function_definition,
        $._object,
        $.variable_definition,
        $.variable_definition_sequence,
        $.destructuring_assignment,
        $.return_statement,
        $.control_structure,
      ),

    // These are the values that may be assigned to a variable or argument
    _object: $ =>
      choice(
        prec(2, $.class),
        $.function_call,
        $.association,
        $.nil_check,
        $.event,
        $.code_block,
        $.function_block,
        $.control_structure,
        $.literal,
        $.variable,
        $.binary_expression,
        $.unary_expression,
        $.collection,
        $.indexed_collection,
        $.partial,
        $.duplicated_statement,
        $.list_comprehension,
        $.ref_expression,
        // NOTE: Routine shorthand (r { }) not supported - can't disambiguate from
        // "r" as variable followed by function_block
      ),

    partial: $ => prec.right(PRECEDENCE.partial, "_"),

    duplicated_statement: $ =>
      prec.left(
        PRECEDENCE.duplication,
        seq(
          field("duplicated_object", $._object),
          field("operator", "!"),
          field("duplication_times", $._object),
        ),
      ),

    // List comprehension: {: body, qualifiers }
    // Examples:
    //   {: [x,y], x <- (1..3), y <- [\a,\b,\c] }
    //   {: x, x <- (1..3), y <- (1..x) }
    //   {: z, x <- (1..20), var z = (x*x-x) div: 2, z.odd }
    //   {:x, x<-(1..), :: "side effect".postln }
    //   { : x, x <- (1..3) }  (space may stand between the brace and the
    //   colon; it is still the one token that opens a comprehension)
    list_comprehension: $ =>
      seq(
        choice(
          alias(token(seq("{", /\s*/, ":")), "{:"),
          // `{; x, x <- y }`: the same, opened with a semicolon (lang11d:
          // generator)
          alias(token(seq("{", /\s*/, ";")), "{;"),
        ),
        field("body", expressionSequence($)),
        ",",
        sepBy1(",", $._comprehension_clause),
        "}",
      ),

    _comprehension_clause: $ =>
      choice(
        $.comprehension_generator,
        $.comprehension_binding,
        $.comprehension_side_effect,
        $.comprehension_while,
        $.comprehension_until,
        $.comprehension_filter,
      ),

    // x <- collection
    // NOTE: Uses _object on left to allow parser to reinterpret after seeing <-
    // Semantically it should be an identifier, but this helps parsing
    comprehension_generator: $ =>
      prec.dynamic(
        100,
        seq(
          field("name", $._object),
          // a second name: `{: x, x z <- y }` (lang11d: qual)
          optional(
            field("name", choice($.identifier, alias(/[a-z]/, $.identifier))),
          ),
          $.generator_arrow,
          field("collection", $._object),
        ),
      ),

    // var z = expr
    comprehension_binding: $ =>
      prec(
        2,
        seq(
          "var",
          field("name", $.identifier),
          "=",
          field("value", $._object),
        ),
      ),

    // :: side_effect
    comprehension_side_effect: $ =>
      prec(
        2,
        seq(
          // two colons, which may stand apart: `: : x.postln`
          alias(token(seq(":", /\s*/, ":")), "::"),
          field("effect", $._object),
        ),
      ),

    // :while condition - terminate when false
    comprehension_while: $ =>
      prec(
        2,
        seq(
          // a colon and the name, which may stand apart: `: while x < 3`
          alias(token(seq(":", /\s*/, "while")), ":while"),
          field("condition", $._object),
        ),
      ),

    // :until condition - terminate when true
    comprehension_until: $ =>
      prec(
        2,
        seq(
          ":until",
          field("condition", $._object),
        ),
      ),

    // condition (any expression that evaluates to boolean)
    // Negative dynamic precedence so generator/binding/etc match first
    comprehension_filter: $ => prec.dynamic(-10, prec(1, $._object)),

    /////////////////
    // 	Functions  //
    /////////////////

    function_definition: $ =>
      prec.left(
        1,
        seq(
          field("name", $.variable),
          "=",
          field("value", $.function_block),
        ),
      ),

    apply_call: $ =>
      prec.left(
        PRECEDENCE.call,
        seq(
          ".",
          "(",
          optional(field("arguments", $.parameter_call_list)),
          ")",
          optional(blockList($)),
        ),
      ),

    function_call: $ =>
      prec.right(
        PRECEDENCE.call,
        choice(
          // Free / namespaced calls, including Class(...) and ar(SinOsc, 110)
          // Optionally followed by a trailing block: collect((1..10)) { |n| n.squared }
          // (a one-letter name is a token of its own)
          seq(
            field(
              "callee",
              choice(
                alias($.identifier, $.method_name),
                alias(/[a-z]/, $.method_name),
                $.class,
              ),
            ),
            "(",
            optional(field("arguments", $.parameter_call_list)),
            ")",
            optional(blockList($)),
          ),
          // Function call with trailing blocks: fork { }, Routine { }, Task { },
          // `r { }`, all {: x, x <- (1..10) }
          seq(
            field(
              "callee",
              choice(
                alias($.identifier, $.method_name),
                alias(/[a-z]/, $.method_name),
                $.class,
              ),
            ),
            blockList($),
          ),
          // A control structure's name is a name like any other to sclang:
          // written in a way its own rule below does not know (`if(a)`,
          // `for { a }`), the call is a plain call.
          // The precedences, static and dynamic, are under every other: where
          // its own rule fits, that is what is read.
          prec.dynamic(
            -1,
            prec(
              -1,
              seq(
                field(
                  "callee",
                  alias(choice(...CONTROL_NAMES), $.method_name),
                ),
                choice(
                  seq(
                    "(",
                    optional(field("arguments", $.parameter_call_list)),
                    ")",
                    optional(blockList($)),
                  ),
                  blockList($),
                ),
              ),
            ),
          ),
          // Parenthesized binary operator as callee: (+++)(a, 99, _)
          // sclang lang11d msgsend: '(' binop2 ')' '(' arglist ')' blocklist
          // and '(' binop2 ')' blocklist1.
          // Exists to pass an operator's adverb dynamically — infix adverbs
          // (a +++.1 b) are compile-time literals. See Syntax-Shortcuts.
          seq(
            "(",
            field(
              "callee",
              alias(
                // an operator, or a name with its colon: `(foo:)(1, 2)`
                choice(operatorName($), $.event_key),
                $.method_name,
              ),
            ),
            ")",
            choice(
              seq(
                "(",
                optional(field("arguments", $.parameter_call_list)),
                ")",
                optional(blockList($)),
              ),
              blockList($),
            ),
          ),
          // Instance method (chainable)
          seq(
            field("receiver", $._object),
            repeat1(
              choice(
                $.method_call,
                $.instance_variable_setter_call,
                $.apply_call,
                // receiver.[index]: an index written as a message
                seq(".", $._index),
              ),
            ),
          ),
        ),
      ),

    method_call: $ =>
      prec.left(
        seq(
          ".",
          // A method may be called by a control structure's name. Where
          // `x.if ...` is written as the if rule knows it, it is that rule's.
          field(
            "name",
            choice(
              alias($.identifier, $.method_name),
              ...CONTROL_NAMES
                .filter(word => word != "if")
                .map(word => alias(word, $.method_name)),
              prec.dynamic(-20, alias("if", $.method_name)),
            ),
          ),
          // receiver.method(args...) or receiver.method { ... }
          optional(
            seq(
              "(",
              optional(field("arguments", $.parameter_call_list)),
              ")",
            ),
          ),
          // Optional trailing block(s): .if{ true } or .if{ true }{ false }
          // A trailing list comprehension is also a function argument:
          // d.keyDownAction.addFunc {:x, x<-(1..), :: "...".postf(x) }
          // Any number may follow, of either kind (lang11d: blocklist).
          optional(
            seq(
              choice(
                field("block", $.function_block),
                field("comprehension", $.list_comprehension),
              ),
              optional(
                seq(
                  choice(
                    field("else_block", $.function_block),
                    $.list_comprehension,
                  ),
                  repeat(choice($.function_block, $.list_comprehension)),
                ),
              ),
            ),
          ),
        ),
      ),

    instance_variable_setter_call: $ =>
      prec.left(
        2,
        seq(
          ".",
          field("name", optional(alias($.identifier, $.method_name))),
          "_",
          // Instance.method or Instance.method()
          optional(seq("(", optional($.parameter_call_list), ")")),
        ),
      ),

    // _expression_sequence: $ =>
    //  seq(
    //    // zero or more `expression;` pairs
    //    repeat(prec.right(1, seq($._expression, ";"))),
    //    // final expression (no `;` required)
    //    $._expression,
    //    // allow a trailing `;`
    //    optional(";"),
    //  ),

    _expression_sequence: $ =>
      seq(
        repeat(
          choice(
            // variable_definition_sequence includes its own semicolon. The
            // precedence keeps it a line of its own before a return, not
            // the expression the return follows.
            prec(1, $.variable_definition_sequence),
            // A primitive call needs no semicolon after it, and may have one
            seq($.primitive, optional(";")),
            // Other expressions need semicolons added
            prec.right(1, seq($._expression, ";")),
          ),
        ),
        // Final expression (no semicolon), or, where a method is nothing but
        // its primitive, that. A return that ends the body needs no semicolon
        // before it: `this.do { ... } ^res`.
        choice(
          $._expression,
          $.primitive,
          seq($._expression, $.return_statement),
        ),
        optional(";"),
      ),

    _paren_expression_list: $ =>
      seq(
        $._expression,
        ",",
        sepBy1(",", $._expression),
        optional(","),
        optional(";"),
      ),

    code_block: $ =>
      prec(
        PRECEDENCE.code_block,
        seq(
          "(",
          optional(
            choice(
              // Event-style: (key: value, key2: value2) - try this first
              prec.dynamic(100, field("pairs", $._paired_associative_sequence)),
              // Prefer statement-style blocks when ambiguous
              prec(2, $._expression_sequence),
              // Interpreted code that is all in parentheses may open with
              // arguments there: `(arg a; a + 1)` (lang11d: cmdlinecode)
              seq(
                field("params", $.parameter_list),
                optional($._expression_sequence),
              ),
              $._paren_expression_list,
            ),
          ),
          ")",
        ),
      ),

    function_block: $ =>
      seq(
        // Optional # prefix for closed functions (don't capture outer scope)
        optional(field("closed", "#")),
        "{",
        // { |x, y| ... } or { arg x, y; ... }
        optional(field("params", $.parameter_list)),
        // body is a standard expression sequence; last expr may omit ;
        optional(field("body", $._expression_sequence)),
        "}",
      ),

    // A call of a primitive: `_BasicNew`, on a line of its own at the head of
    // a method. A name that begins with an underscore and a capital is always
    // one; an identifier is the same length, so the precedence chooses.
    primitive: $ => token(prec(1, /_[A-Z][a-zA-Z\d_]*/)),

    _function_content: $ =>
      choice(
        seq(
          "{",
          optional($.parameter_list),
          optional($._expression_sequence),
          "}",
        ),
        seq(
          seq("(", "{"),
          optional($.parameter_list),
          optional($._expression_sequence),
          seq(")", "}"),
        ),
      ),

    // Definition of parameters in function
    parameter_list: $ =>
      choice(
        seq(
          "arg",
          sepBy(",", $.argument),
          optional(alias($.variable_argument, $.argument)),
          ";",
        ),
        // 2. Pipe style (CHANGE THIS)
        // Was: seq("|", sepBy(..., $.argument), "|")
        // Now: Use the new rule we created!
        $.pipe_parameter_list,
      ),

    // 2. Standard 'arg' declaration (e.g., "arg a = 1;")
    argument: $ =>
      seq(
        field("name", name($)),
        optional($.argument_default),
      ),

    // `= value`, or the older `name(value)`
    argument_default: $ =>
      choice(
        seq("=", field("value", $._expression)),
        seq("(", field("value", $._expression), ")"),
      ),

    // Safe expressions that cannot contain | as a binary operator
    _pipe_safe_expression: $ =>
      choice(
        $.literal,
        $.variable,
        $.function_call,
        $.function_block,
        $.code_block,
        $.collection,
        $.indexed_collection,
        $.partial,
        $.duplicated_statement,
        $.pipe_safe_unary_expression,
        $.pipe_safe_nil_check,
        $.association,
        $.control_structure,
        $.event,
        prec(2, $.class),
      ),

    // Unary expressions that use safe expressions (no | binary op)
    pipe_safe_unary_expression: $ => {
      const table = [
        [PRECEDENCE.unary, "-"],
        [PRECEDENCE.unary, "*"],
        [PRECEDENCE.unary, ":"],
        [PRECEDENCE.unary, "!"],
      ];

      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(
              field("operator", operator),
              field("right", $._pipe_safe_expression),
            ),
          )
        ),
      );
    },

    // Nil check that uses safe expressions (no | binary op)
    pipe_safe_nil_check: $ =>
      prec.left(
        seq(
          $._pipe_safe_expression,
          choice("?", "!?", "??"),
          $._pipe_safe_expression,
        ),
      ),

    // Pipe argument uses restricted expressions
    pipe_argument: $ =>
      seq(
        field("name", name($)),
        field(
          "value",
          optional(
            choice(
              seq("=", $._pipe_safe_expression),
              // the older `name(value)`
              seq("(", $._expression, ")"),
              // before a literal or its negative the equals sign may be
              // left out: `|start = 0, range -1|`. nil, inf and a literal
              // array are literals here as well.
              $.literal,
              $.pipe_safe_unary_expression,
              alias(alias(choice("nil", "inf"), $.builtin_var), $.variable),
              alias(literalArray($), $.collection),
            ),
          ),
        ),
      ),

    pipe_parameter_list: $ =>
      seq(
        $.pipe_token,
        optional(
          seq(
            choice($.pipe_argument, alias($.variable_argument, $.argument)),
            repeat(
              seq(
                optional(","), // comma optional between args
                choice($.pipe_argument, alias($.variable_argument, $.argument)),
              ),
            ),
          ),
        ),
        $.pipe_token,
      ),

    // see https://doc.sccode.org/Reference/Functions.html#Variable%20Arguments
    variable_argument: $ => seq("...", field("name", name($))),

    // When supplying arguments to a function call
    parameter_call_list: $ => prec.left(seq(sepBy1(",", $.argument_calls), optional(","))),

    argument_calls: $ =>
      choice(
        $.named_argument,
        $.unnamed_argument,
      ),

    // function call is added here to allow things like Array() in params
    // Also allows statement sequences like foo(a; b; c) where the value is c
    unnamed_argument: $ => expressionSequence($),

    named_argument: $ =>
      prec.left(
        10,
        field(
          "name",
          choice(
            seq(
              choice($.symbol, name($)),
              choice("=", ":"),
              expressionSequence($),
            ),
            // Single-letter names lex as environment_var's /[a-z]/ token,
            // so they need their own branch (`f.value(2, c: 3)`). Restricted
            // to the `:` form only — otherwise assignments to interpreter
            // globals in arg position (`f(n = x; ...)`) would be captured
            // as named arguments and break exprseq parsing.
            seq(
              alias(/[a-z]/, $.identifier),
              ":",
              expressionSequence($),
            ),
          ),
        ),
      ),

    ///////////////////////
    // 	Define literal	//
    ///////////////////////

    pi_statement: $ =>
      choice(
        "pi",
        seq(
          optional(choice($.integer, $.float, $.exponential)),
          "pi",
        ),
      ),

    number: $ =>
      choice(
        $.integer,
        $.float,
        $.hexinteger,
        $.radix_integer,
        $.exponential,
        $.pi_statement,
        $.accidental,
      ),

    literal: $ =>
      choice(
        $.number,
        $.symbol,
        $.char,
        $.string,
        $.bool,
      ),

    integer: $ => /\d+/,
    hexinteger: $ => /0x([a-fA-F\d])+/,
    // Radix notation: 2r10010 (binary), 8r777 (octal), 16rFF (hex), etc.
    radix_integer: $ => /\d+r[a-zA-Z0-9]+/,
    float: $ => /\d+\.\d+/,
    exponential: $ => /-?\d+(\.\d+)?[eE][-+]?\d+/,
    // Musical accidentals: 1b (flat), 5s (sharp) - used in degree notation,
    // any number of them (2ss), and cents after (2s50)
    // Lexer prefers longer match, so 1b matches accidental rather than integer+identifier
    accidental: $ => /\d+(b+|s+)\d*/,

    symbol: $ =>
      choice(
        // The name runs on from the backslash and is all the symbol's: in
        // `(\id: 3)` the colon is not part of it, as it would be of a
        // selector (`x id: 3`), which the precedence is there to outrank.
        prec.left(
          seq(
            "\\",
            optional(
              choice(
                alias(token.immediate(prec(1, NAME)), $.identifier),
                token.immediate(/[0-9]+/),
                $.escape_sequence,
              ),
            ),
          ),
        ),
        // One token from quote to quote, so that nothing inside it is read
        // as anything else: `'/*'` holds no comment. A backslash takes the
        // character after it, whatever that is.
        token(seq("'", repeat(choice(/[^'\\]/, /\\[\s\S]/)), "'")),
      ),

    // The character is whatever follows the dollar sign, a line break too;
    // after a backslash, whatever follows that.
    char: $ => /\$(\\[\s\S]|[^\\])/,

    // Strings that stand side by side are one string to sclang:
    // "one part, " "and the rest".
    string: $ => prec.right(repeat1($._string_part)),

    _string_part: $ =>
      seq(
        "\"",
        // The text is the scanner's to read: it alone can tell that the
        // `/*` of "/* not a comment" opens nothing.
        repeat(choice($._string_content, $.escape_sequence)),
        "\"",
      ),

    bool: $ => choice("true", "false"),

    // A backslash takes the character after it, whatever that is: sclang
    // knows \n, \r, \t, \f and \v, and any other stands for itself.
    escape_sequence: $ => token.immediate(/\\[\s\S]/),

    /////////////////
    // 	Variables  //
    /////////////////

    variable: $ =>
      choice(
        $.environment_var,
        $.local_var,
        $.classvar,
        $.builtin_var,
        $.instance_var,
      ),

    builtin_var: $ =>
      field(
        "name",
        choice(
          "inf",
          "nil",
          "thisFunction",
          "thisFunctionDef",
          "thisMethod",
          "thisProcess",
          "thisThread",
          "currentEnvironment",
          "topEnvironment",
        ),
      ),

    local_var: $ =>
      prec(
        PRECEDENCE.localvar,
        choice(
          field("name", name($)),
          // seq("var", field("name", $.identifier)),
        ),
      ),

    instance_var: $ =>
      seq(
        optional("var"),
        optional(choice("<", ">", "<>")),
        field("name", $.identifier),
      ),

    classvar: $ =>
      seq(
        "classvar",
        optional(choice("<", ">", "<>")),
        field("name", $.identifier),
      ),

    const: $ =>
      seq(
        "const",
        optional(choice("<", ">", "<>")),
        field("name", $.identifier),
      ),

    environment_var: $ =>
      choice(
        field("name", alias(/[a-z]/, $.identifier)),
        field("name", alias(seq("~", $.identifier), $.identifier)),
      ),

    variable_name: $ => $.identifier,

    // helper: one name (with optional initializer) in a `var` list
    var_binding: $ =>
      seq(
        field("name", name($)),
        optional(
          choice(
            seq(
              "=",
              field("value", choice($.class, $._object)),
            ),
            // the older `name(value)`
            seq("(", field("value", expressionSequence($)), ")"),
          ),
        ),
      ),

    variable_definition_sequence: $ =>
      prec.left(
        PRECEDENCE.vardef_sequence,
        seq(
          "var",
          sepBy1(",", $.var_binding),
          optional(","), // allow trailing comma
          ";",
        ),
      ),

    variable_definition: $ =>
      prec(
        PRECEDENCE.vardef,
        seq(
          field("name", $.variable),
          "=",
          field("value", choice($.class, $._object)),
        ),
      ),

    // Destructuring assignment: #a, b, c = someArray
    destructuring_assignment: $ =>
      prec(
        PRECEDENCE.vardef,
        seq(
          "#",
          choice(
            // With rest: # a, b ... c = value
            seq(
              sepBy1(",", field("name", $.identifier)),
              "...",
              field("rest", $.identifier),
            ),
            // Without rest: # a, b, c = value
            sepBy1(",", field("name", $.identifier)),
          ),
          "=",
          field("value", $._object),
        ),
      ),

    ///////////////
    // 	Classes  //
    ///////////////

    return_statement: $ => prec.left(PRECEDENCE.unary, seq("^", $._object)),

    // Where a class definition and a call with a block both fit to the end
    // (`Foo { bar { ^1 } }` standing alone), it is the class definition.
    class_def: $ =>
      prec.dynamic(
        10,
        prec(
        PRECEDENCE.class_def,
        seq(
          optional("+"),
          $.class,
          // `Array[slot]`, `String[char]`: what an indexed class holds
          // (a variable's precedence, so that neither reading of the name
          // inside outranks the other: see the conflicts)
          optional(
            prec(PRECEDENCE.localvar, seq("[", optional($.identifier), "]")),
          ),
          optional(seq(":", alias($.class, $.parent_class))),
          "{",
          repeat(
            choice(
              // Variables
              seq(
                sepBy(
                  ",",
                  choice(
                    // Variable declaration
                    choice(
                      alias($.local_var, $.instance_var),
                      $.instance_var,
                      $.classvar,
                    ),
                    // variable definiton
                    seq(
                      choice(
                        alias($.local_var, $.instance_var),
                        $.instance_var,
                        $.classvar,
                      ),
                      "=",
                      $._object,
                    ),
                  ),
                ),
                ";",
              ),
              // Constants: each has a value, and the comma between two may
              // be left out (lang11d: constdeflist optcomma constdef).
              seq(
                $.const,
                "=",
                $._object,
                repeat(
                  seq(
                    optional(","),
                    choice(alias($.local_var, $.instance_var), $.instance_var),
                    "=",
                    $._object,
                  ),
                ),
                ";",
              ),
              // Instance method. A lone `*` is its name or the class method
              // marker; what follows (a block, or a name) says which it is.
              // The precedence is a call's, so that neither outranks the
              // other and the conflict declared above is left to be settled
              // by what follows.
              prec.right(PRECEDENCE.call, seq(
                alias(methodName($), $.instance_method_name),
                $.function_block,
              )),
              // Class method (a call's precedence, as for the instance method)
              // The marker is the `*` of an expression under another name,
              // not a rule of its own: where a class definition and a call
              // with a block are both being followed, a rule would have to
              // be reduced before the name after it is seen.
              prec.right(PRECEDENCE.call, seq(
                alias("*", $.class_method_marker),
                alias(methodName($), $.class_method_name),
                $.function_block,
              )),
            ),
          ),
          "}",
        ),
        ),
      ),

    ////////////////
    // 	Comments  //
    ////////////////

    comment: $ =>
      choice(
        $.line_comment,
        $.block_comment,
      ),

    line_comment: $ => prec(PRECEDENCE.comment, token(seq("//", /.*/))),

    ///////////////////
    // 	Collections  //
    ///////////////////

    ref: $ => "`",

    // Ref expression: `expr creates a Ref object
    // Examples: `5, `(expr), `[1,2,3], `nil
    ref_expression: $ =>
      prec.right(
        PRECEDENCE.unary,
        seq(
          $.ref,
          choice(
            $.literal,
            $.variable,
            $.collection,
            $.function_call,
            seq("(", expressionSequence($), ")"),
            // `` `(a: 1) ``, `` `{ 1 } ``, `` `a[0] ``, `` ``a ``, `` `-1 ``,
            // `` `Object ``: sclang takes any expression here (lang11d:
            // '`' expr).
            $.event,
            $.function_block,
            $.list_comprehension,
            $.indexed_collection,
            $.ref_expression,
            $.unary_expression,
            $.class,
            $.partial,
          ),
        ),
      ),

    event: $ =>
      prec.dynamic(
        100, // Very high dynamic precedence to win over code_block for (key: value) patterns
        prec(
          PRECEDENCE.code_block + 1,
          seq(
            "(",
            field("pairs", $._paired_associative_sequence),
            ")",
          ),
        ),
      ),

    collection: $ =>
      prec.left(
        seq(
          choice(
            $.arithmetic_series,
            prec.left(
              seq(
                // NOTE: Backtick prefix ($.ref) removed - now handled by ref_expression
                optional("#"),
                optional(
                  choice(
                    optional(alias($.class, $.collection_type)),
                  ),
                ),
                "[",
                optional($._collection_sequence),
                "]",
              ),
            ),
          ),
        ),
      ),

    _collection_sequence: $ =>
      seq(
        prec.left(
          sepBy1(
            ",",
            choice(
              $.associative_item,
              // Expression-sequence element: `a; b` evaluates all, value is
              // last. lang11d: arrayelems1 elements are exprseq, and
              // exprseq is `exprn optsemi` — so a trailing `;` inside an
              // element is legal sclang: [x, foo(y);]
              expressionSequence($),
            ),
          ),
        ),
        optional(","),
      ),

    _paired_associative_sequence: $ => seq(sepBy1(",", $.associative_item), optional(",")),

    association: $ =>
      prec(
        PRECEDENCE.association,
        seq(
          field("key", prec.left($._object)),
          field("operator", prec(PRECEDENCE.assign, "->")),
          field("value", prec.right($._object)),
        ),
      ),

    associative_item: $ =>
      choice(
        prec.dynamic(
          50, // High dynamic precedence to win over unary : interpretation
          prec(
            PRECEDENCE.associative_item,
            choice(
              // key: value, the key a name with its colon directly after it
              // (sclang's KEYBINOP): the key is the symbol of that name.
              seq(
                field("key", $.event_key),
                field("value", alias(expressionSequence($), $.item)),
              ),
              // symbol key: \key: value
              seq(
                field("key", $.symbol),
                ":",
                field("value", alias(expressionSequence($), $.item)),
              ),
              // string key: "key": value
              seq(
                field("key", $.string),
                ":",
                field("value", alias(expressionSequence($), $.item)),
              ),
              // number key: 0: value, 1: value (for Prewrite patterns etc)
              seq(
                field("key", $.number),
                ":",
                field("value", alias(expressionSequence($), $.item)),
              ),
              // keyObj -> valueObj
              $.association,
            ),
          ),
        ),
        // Any other expression as the key, its colon apart from it:
        // `(a : 1)` is keyed by the value of the variable a, where `(a: 1)`
        // is keyed by the symbol \a. No precedence: whether `(a; b` goes on
        // as statements or as a key shows only at the colon, so both are
        // followed (see the conflicts).
        seq(
          field("key", expressionSequence($)),
          ":",
          field("value", alias(expressionSequence($), $.item)),
        ),
      ),

    _collection_types: $ =>
      choice(
        $._unordered_collection_types,
        $._ordered_collection_types,
      ),

    _unordered_collection_types: $ =>
      choice(
        "Bag",
        "Dictionary",
        "Environment",
        "Event",
        "IdentityBag",
        "IdentityDictionary",
        "IdentitySet",
        "LazyEnvir",
        "MultiLevelIdentityDictionary",
        "ObjectTable",
        "Set",
        "TwoWayIdentityDictionary",
      ),

    _ordered_collection_types: $ =>
      choice(
        "Array",
        "Array2D",
        "ArrayedCollection",
        "DoubleArray",
        "FloatArray",
        "Int16Array",
        "Int32Array",
        "Int8Array",
        "LinkedList",
        "List",
        "Order",
        "OrderedIdentitySet",
        "Pair",
        "PriorityQueue",
        "RawArray",
        "SequenceableCollection",
        "Signal",
        "SortedList",
        "SparseArray",
        "String",
        "SymbolArray",
      ),

    _indexable_object: $ =>
      choice(
        // `_[0]`: the index of whatever is passed
        $.partial,
        $.collection,
        $.variable,
        // a literal of any kind, bare as the string always was here
        $.number,
        $.symbol,
        $.char,
        $.string,
        $.bool,
        $.function_call,
        prec.left(1, $.code_block),
        $.control_structure,
        // `(a: 1)[\a]`, `{ 1 }[0]`, `{: x, x <- y }[0]`
        $.event,
        $.function_block,
        $.list_comprehension,
      ),

    indexed_collection: $ =>
      seq(
        $._indexable_object,
        repeat($._index),
        $._index,
      ),

    index_subrange: $ =>
      choice(
        seq($._numeric_expression, ".."),
        seq("..", $._numeric_expression),
        seq($._numeric_expression, "..", $._numeric_expression),
        seq(
          $._numeric_expression,
          ",",
          $._numeric_expression,
          "..",
          optional($._numeric_expression),
        ),
      ),

    _index: $ => {
      // An index may be any expression. A number, a symbol, a string, a
      // character or a boolean stands as itself, not as a `literal`; and
      // `(key: value)` is here the `code_block` a numeric expression has.
      const item = choice(
        $._numeric_expression,
        $.symbol,
        $.string,
        $.char,
        $.bool,
        $.class,
        $.association,
        $.function_block,
        $.control_structure,
        $.collection,
        $.duplicated_statement,
        $.list_comprehension,
        $.ref_expression,
      );

      return seq(
        "[",
        field(
          "index",
          choice(
            // One index, or several: a[2, 3] for multi-dimensional arrays.
            // Each is a sequence of expressions: a[b; c]
            sepBy1(",", seq(item, repeat(seq(";", item)), optional(";"))),
            $.index_subrange,
          ),
        ),
        "]",
      );
    },

    // Each part of a series is a sequence of expressions, worth its last:
    // `(a; b .. c)` (lang11d: valrange2, of exprseq).
    arithmetic_series: $ =>
      seq(
        "(",
        choice(
          // (start, step .. end) - series with explicit step
          seq(
            seriesPart($),
            ",",
            seriesPart($),
            "..",
            seriesPart($),
          ),
          // (.. end) - from beginning to end; (:.. end), the same as a stream
          seq(optional(":"), "..", seriesPart($)),
          // (start .. end) - simple range
          seq(seriesPart($), "..", seriesPart($)),
          // (start ..) - open-ended range (infinite series)
          seq(seriesPart($), ".."),
          // (start, step ..) - open-ended with step
          seq(seriesPart($), ",", seriesPart($), ".."),
        ),
        ")",
      ),

    ///////////////////
    // 	Expressions  //
    ///////////////////

    // Adverbs modify binary operators for collection operations
    // Examples: +.s (short), +.x (cross), +.t (table), +.f (flat), +.0, +.1
    // An adverb is a name of any length (`<<>.in1`), an integer, or an
    // expression in parentheses (lang11d: adverb).
    adverb: $ =>
      seq(
        ".",
        choice(
          /[a-z]/,
          alias($.identifier, "name"),
          /-?[0-9]+/,
          seq("(", expressionSequence($), ")"),
        ),
      ),

    binary_expression: $ => {
      const table = [
        // "Selector as binary operator" e.g. `x foo: y`
        // NOTE: This conflicts with associative_item in events - use filter in extractor
        [
          PRECEDENCE.selectorBinary,
          alias(
            /(r#)?[a-zA-Zα-ωΑ-Ωµ_][a-zA-Zα-ωΑ-Ωµ\d_]*:/,
            $.method_name,
          ),
        ],

        // "Regular" binary operators
        // NOTE: Within each choice(), longer operators MUST come first
        // (e.g., === before ==) for correct lexing
        [PRECEDENCE.and, "&&"],
        [PRECEDENCE.or, "||"],
        [PRECEDENCE.bitand, "&"],
        [PRECEDENCE.bitor, prec.dynamic(-1, $.pipe_token)],
        [
          PRECEDENCE.comparative,
          choice("===", "!==", "==", "!=", "<", "<=", ">", ">="),
        ],
        [PRECEDENCE.shift, choice("<<<", "<<>", "<<", ">>", "+>>", "+<<")],
        [PRECEDENCE.additive, choice("+++", "++", "+", "-")],
        [
          PRECEDENCE.multiplicative,
          choice("*", "/", "%", prec.left("**")),
        ],
        [PRECEDENCE.assign, "="],

        // String concatenation
        [PRECEDENCE.stringConcat, "+/+"],

        // Indexing operators (@, @@, etc.)
        [PRECEDENCE.indexing, choice("@", "@@", "|@|", "@|@")],

        // Function composition
        [PRECEDENCE.compose, "<>"],

        // Any other run of operator characters: `a <-- b`, `a |==| b`
        [PRECEDENCE.compose, alias($._operator, $.operator)],
      ];

      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(
              field("left", $._object),
              field("operator", seq(operator, optional($.adverb))),
              field("right", $._object),
            ),
          )
        ),
      );
    },

    unary_expression: $ => {
      const table = [
        [PRECEDENCE.unary, "-"],
        [PRECEDENCE.unary, "*"],
        // (:1..) style
        [PRECEDENCE.unary, ":"],
        [PRECEDENCE.unary, "!"],
      ];

      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(
              field("operator", operator),
              field("right", $._object),
            ),
          )
        ),
      );
    },

    class: $ => prec(PRECEDENCE.class, field("name", /[A-Z]+[a-zA-Z\d_]*/)),

    identifier: $ => NAME,

    // Nil check
    // @FIXME: Should be a binary operator
    nil_check: $ =>
      prec.left(
        seq(
          $._object,
          choice("?", "!?", "??"),
          $._object,
        ),
      ),

    // Expressions that can hold or return a single value
    _numeric_expression: $ =>
      choice(
        $.number,
        $.variable,
        $.binary_expression,
        $.unary_expression,
        $.function_call,
        $.method_call,
        $.code_block,
        $.indexed_collection,
        $.nil_check,
        // `(1.._)`: the series up to whatever is passed
        $.partial,
      ),

    ////////////////////
    // 	Conditionals  //
    ////////////////////

    control_structure: $ =>
      prec(
        PRECEDENCE.controlstruct,
        choice(
          $.if,
          $.while,
          $.for,
          $.forby,
          $.case,
          $.switch,
          $.protect,
          $.try,
          // NOTE: loop, fork, bench are intentionally NOT included here.
          // They are regular functions that take trailing blocks, not true
          // control structures. Making them keywords breaks code like:
          //   PlayBuf.ar(2, buf, loop: 1)  // 'loop' as named argument
          // They parse correctly via function_call's trailing block syntax:
          //   seq(field("callee", $.method_name), field("block", $.function_block))
        ),
      ),

    // protect { normalCode } { onExitCode }
    // The onExit function is always called, even if normalCode throws
    protect: $ =>
      choice(
        prec.right(
          seq(
            "protect",
            field("body", $.function_block),
            optional(field("onExit", $.function_block)),
          ),
        ),
        // protect(normalFunc, onExitFunc): the same, written as a call
        seq(
          "protect",
          "(",
          field("body", $._object),
          optional(seq(",", field("onExit", $._object))),
          ")",
        ),
      ),

    // try { code } { onErrorCode }
    // If code throws, onErrorCode is called with the error
    try: $ =>
      choice(
        prec.right(
          seq(
            "try",
            field("body", $.function_block),
            optional(field("onError", $.function_block)),
          ),
        ),
        // try(func, onErrorFunc): the same, written as a call
        seq(
          "try",
          "(",
          field("body", $._object),
          optional(seq(",", field("onError", $._object))),
          ")",
        ),
      ),

    if: $ =>
      choice(
        // if (expr) trueFunc falseFunc
        prec.dynamic(
          1000, // <- VERY high dynamic precedence
          prec.right(
            seq(
              field("name", "if"),
              "(",
              field("expression", $._object),
              ")",
              field("true", $.function_block),
              optional(field("false", $.function_block)),
            ),
          ),
        ),
        // if (expr, trueExpr, falseExpr); - can be any expression, not just functions
        prec.right(
          seq(
            field("name", "if"),
            "(",
            field("expression", $._object),
            field("true", seq(",", $._object)),
            optional(field("false", seq(",", $._object))),
            ")",
          ),
        ),
        // expr.if(...)
        seq(
          prec.left(
            1,
            seq(
              field("expression", $._object),
              field("name", seq(".", "if")),
            ),
          ),
          choice(
            // expr.if { truefunc } { falsefunc } - two trailing blocks
            seq(
              field("true", $.function_block),
              field("false", $.function_block),
            ),
            // expr.if { truefunc }
            field("true", $.function_block),
            // expr.if(trueExpr, falseExpr) - any expression in parens
            prec.dynamic(
              -10,
              seq(
                "(",
                field("true", $._object),
                ",",
                field("false", $._object),
                ")",
              ),
            ),
            // expr.if({truefunc}, {falsefunc}) - blocks in parens
            seq(
              "(",
              field("true", $.function_block),
              ",",
              field("false", $.function_block),
              ")",
            ),
            // expr.if({truefunc}) - single block in parens
            seq(
              "(",
              field("true", $.function_block),
              ")",
            ),
          ),
        ),
      ),

    while: $ =>
      choice(
        // while ( testFunc, bodyFunc );
        prec.left(
          1,
          seq(
            field("name", "while"),
            "(",
            field("test_func", $.function_block),
            ",",
            field("body_func", $.function_block),
            ")",
          ),
        ),
        // testFunc.while { bodyFunc }. The precedence is over a method call's:
        // written just so, it is this.
        prec.left(
          1,
          seq(
            field("expression", $._object),
            field("name", seq(".", "while")),
            field("body_func", $.function_block),
          ),
        ),
        // while testFunc bodyFunc;
        prec.left(
          seq(
            field("name", "while"),
            field("test_func", $.function_block),
            field("body_func", $.function_block),
          ),
        ),
        // while { testFunc } - single block, no body (loops until false)
        prec.left(
          -1, // Lower precedence than two-block form
          seq(
            field("name", "while"),
            field("test_func", $.function_block),
          ),
        ),
        // while (expr) { body }, and, where the test does all there is to
        // do, while (expr)
        prec.left(
          1,
          seq(
            field("name", "while"),
            "(",
            field("expression", $._object),
            ")",
            optional(field("body_func", $.function_block)),
          ),
        ),
      ),

    for: $ =>
      choice(
        // for(start, end, func) — start, end and the function may be
        // arbitrary expressions
        seq(
          "for",
          "(",
          $._object,
          ",",
          $._object,
          ",",
          $._object,
          ")",
        ),
        // for(start, end) { func }
        seq(
          "for",
          "(",
          $._object,
          ",",
          $._object,
          ")",
          $.function_block,
        ),
        // for(start, end, step, func)
        seq(
          "for",
          "(",
          $._object,
          ",",
          $._object,
          ",",
          $._object,
          ",",
          $.function_block,
          ")",
        ),
        // start.for(end, func)
        seq(
          $.integer,
          ".",
          "for",
          "(",
          $.integer,
          ",",
          $.function_block,
          ")",
        ),
        // start.for(end, step, func)
        seq(
          $.integer,
          ".",
          "for",
          "(",
          $.integer,
          ",",
          $._object,
          ",",
          $.function_block,
          ")",
        ),
      ),

    forby: $ =>
      choice(
        // forBy ( startValue, endValue, stepValue ) { function } - trailing block
        seq(
          field("name", "forBy"),
          "(",
          $._object,
          ",",
          $._object,
          ",",
          $._object,
          ")",
          field("body", $.function_block),
        ),
        // forBy ( startValue, endValue, stepValue, function );
        seq(
          field("name", "forBy"),
          "(",
          $._object,
          ",",
          $._object,
          ",",
          $._object,
          ",",
          $._object,
          ")",
        ),
        // startValue.forBy ( endValue, stepValue, function );
        seq(
          $.integer,
          field("name", seq(".", "forBy")),
          "(",
          $.integer,
          ",",
          $.integer,
          ",",
          $.function_block,
          ")",
        ),
      ),

    case: $ =>
      prec.left(
        choice(
          // case { test } { body } ...
          seq(
            field("name", "case"),
            repeat($.function_block),
          ),
          // case({ test }, { body }, ...): the same, written as a call
          seq(
            field("name", "case"),
            "(",
            sepBy(",", $._object),
            optional(","),
            ")",
          ),
        ),
      ),

    // Restricted block used only for block-style `switch`:
    // parses exactly `( <_object> )`
    switch: $ =>
      choice(
        // 1) Comma-style switch:
        //    switch (selector,
        //        test1, { ... },
        //        test2, { ... },
        //        ...
        //        defaultFunc // optional
        //    );
        //    A body or the default need not be a block (`$*, \CMETHOD`), and
        //    a comma may follow the last of them.
        seq(
          field("name", "switch"),
          "(",
          field("selector", $._object),
          repeat(
            seq(
              ",",
              field("test", $._object),
              ",",
              field("body", $._object),
            ),
          ),
          optional(
            seq(
              ",",
              field("default", $._object),
            ),
          ),
          optional(","),
          ")",
        ),
        // 2) Block-style switch (no commas):
        //    switch (z)
        //        { 0 } { "zero".postln }
        //        { 1 } { "one".postln }
        //        { 2 } { "two".postln }
        //        { "other".postln };
        prec.right(
          seq(
            field("name", "switch"),
            "(",
            field("selector", $._object),
            ")",
            // One or more { test } { body } pairs
            repeat1(
              seq(
                field("test", $.function_block),
                field("body", $.function_block),
              ),
            ),
            // Optional final default block with no preceding test:
            optional(
              field("default", $.function_block),
            ),
          ),
        ),
      ),
    pipe_token: $ => "|",
    // generator_arrow is defined in externals, handled by src/scanner.c
    _operator: $ => OPERATOR,
  },
});
