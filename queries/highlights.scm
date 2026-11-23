; highlights.scm
;
; SuperCollider coloured the way C and Smalltalk are: class names are types,
; message names are method calls, `this` and its kin are built-in variables,
; `if` and `while` are control keywords, and every literal has its own kind.
; Capture names are Neovim's:
; https://neovim.io/doc/user/treesitter.html#treesitter-highlight-groups
;
; No token is matched by two patterns. Neovim lets the later of two patterns
; win and other highlighters the earlier, so a query that leans on order
; colours differently from one editor to the next. test/highlight/ pins the
; scheme.

; Comments. @spell is not a colour: it tells Neovim where to check spelling.
[ (line_comment) (block_comment) ] @spell @comment

; Literals
[ (integer) (hexinteger) (radix_integer) ] @number
[ (float) (exponential) (accidental) ] @number.float
"pi" @constant.builtin
(bool) @boolean
(char) @character
(string) @string
(symbol) @string.special.symbol
(escape_sequence) @string.escape

; nil and inf are values; the rest of the built-in names are objects that are
; always there, as `self` and `thisContext` are in Smalltalk.
((builtin_var) @constant.builtin
  (#any-of? @constant.builtin "nil" "inf"))
((builtin_var) @variable.builtin
  (#not-any-of? @variable.builtin "nil" "inf"))
((local_var
  name: (identifier) @variable.builtin)
  (#any-of? @variable.builtin "this" "super"))
; Between pipes a default of nil or inf is a node of its own kind.
((variable) @constant.builtin
  (#any-of? @constant.builtin "nil" "inf"))

; Variables. `~name` is a key looked up in the current environment, so it is
; coloured as a member; a one-letter name is an interpreter variable or a
; local one, and the tree cannot tell which.
((local_var
  name: (identifier) @variable)
  (#not-any-of? @variable "this" "super"))
((environment_var
  name: (identifier) @variable.member)
  (#match? @variable.member "^[~]"))
((environment_var
  name: (identifier) @variable)
  (#not-match? @variable "^[~]"))
(var_binding
  name: (identifier) @variable)
(destructuring_assignment
  name: (identifier) @variable)
(destructuring_assignment
  rest: (identifier) @variable)
(comprehension_generator
  name: (identifier) @variable)
(comprehension_binding
  name: (identifier) @variable)

; Parameters, where they are declared and where a call names them
(argument
  name: (identifier) @variable.parameter)
(pipe_argument
  name: (identifier) @variable.parameter)
(named_argument
  name: (identifier) @variable.parameter)
(partial) @variable.parameter.builtin

; Classes and what they declare
[ (class) (parent_class) (collection_type) ] @type
(class_def (identifier) @type)
[ (instance_method_name) (class_method_name) ] @function.method
(instance_var
  name: (identifier) @variable.member)
(classvar
  name: (identifier) @variable.member)
(const
  name: (identifier) @constant)
(primitive) @function.builtin

; What a declaration says about its name: a class method, a getter or a
; setter, an extension of a class that exists
(class_method_marker) @keyword.modifier
(instance_var [ "<" ">" "<>" ] @keyword.modifier)
(classvar [ "<" ">" "<>" ] @keyword.modifier)
(const "<" @keyword.modifier)
(class_def "+" @keyword.modifier)

; Messages: `a.name`, `a.name(b)` and `a name: b`
(method_name) @function.method.call

; Keys of an event
(event_key) @property

; Keywords
[ "var" "arg" "classvar" "const" ] @keyword
[ "if" "case" "switch" ] @keyword.conditional
[ "while" "for" "forBy" ":while" ":until" ] @keyword.repeat
[ "try" "protect" ] @keyword.exception
"^" @keyword.return

; Operators. A binary operator is any run of operator characters, with or
; without an adverb; the pipe is one too when it stands between two values.
(binary_expression
  operator: [
    (operator) (adverb) (pipe_token)
    "!=" "!==" "%" "&" "&&" "*" "**" "+" "++" "+++" "+/+" "+<<" "+>>" "-" "/"
    "<" "<<" "<<<" "<<>" "<=" "<>" "==" "===" ">" ">=" ">>" "@" "@@" "@|@"
    "|@|" "||"
  ] @operator)
(unary_expression
  operator: [ "-" "*" "!" ] @operator)
(pipe_safe_unary_expression "-" @operator)
(duplicated_statement
  operator: "!" @operator)
[ "=" "->" ".." "?" "??" "!?" ] @operator
[ (generator_arrow) (ref) ] @operator

; Punctuation
[ "(" ")" "[" "]" "{" "}" "{:" "{;" ] @punctuation.bracket
(pipe_parameter_list (pipe_token) @punctuation.bracket)
[ ";" "," ":" "::" ] @punctuation.delimiter
; The dot of a message; the dot of an adverb is part of its operator.
(method_call "." @punctuation.delimiter)
(apply_call "." @punctuation.delimiter)
(function_call "." @punctuation.delimiter)
(if "." @punctuation.delimiter)
(while "." @punctuation.delimiter)
(for "." @punctuation.delimiter)
(forby "." @punctuation.delimiter)
[ "#" "..." ] @punctuation.special
; A literal array as a default between pipes: the grammar gives each of its
; brackets the name of the whole.
((collection) @punctuation.bracket
  (#any-of? @punctuation.bracket "[" "]"))
((collection) @punctuation.special
  (#eq? @punctuation.special "#"))
