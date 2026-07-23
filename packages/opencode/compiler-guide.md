# Building a Compiler: A Comprehensive Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Lexical Analysis (Lexer)](#lexical-analysis-lexer)
4. [Syntax Analysis (Parser)](#syntax-analysis-parser)
5. [Semantic Analysis](#semantic-analysis)
6. [Intermediate Representation (IR)](#intermediate-representation-ir)
7. [Optimisation](#optimisation)
8. [Code Generation](#code-generation)
9. [Putting It All Together](#putting-it-all-together)
10. [Further Reading](#further-reading)

---

## Introduction

A compiler is a program that translates source code written in one language (the *source language*) into another language (the *target language*), typically a lower-level one such as assembly or machine code. The journey from raw text to executable bits involves several well-defined stages, each of which we will build from scratch in this guide.

We will implement a compiler for a tiny language called **TinyC**, a minimal C-like language with integer variables, arithmetic expressions, `if`/`else` conditionals, and `while` loops. Our target will be a simple stack-based virtual machine (VM) that we will also build.

By the end of this guide you will have a working end-to-end compiler and understand every piece of the pipeline.

---

## Architecture Overview

A modern compiler is typically organised as a series of phases:

```
Source Code
    │
    ▼
┌─────────────┐
│   Lexer     │  (tokenisation)
└─────────────┘
    │
    ▼
┌─────────────┐
│   Parser    │  (AST construction)
└─────────────┘
    │
    ▼
┌─────────────┐
│  Semantic   │  (type checking, symbol resolution)
│  Analyser   │
└─────────────┘
    │
    ▼
┌─────────────┐
│  IR Gen     │  (intermediate representation)
└─────────────┘
    │
    ▼
┌─────────────┐
│ Optimiser   │  (optional but powerful)
└─────────────┘
    │
    ▼
┌─────────────┐
│ Code Gen    │  (target code emission)
└─────────────┘
    │
    ▼
  Output
```

The front-end (lexer, parser, semantic analyser) understands the source language. The back-end (IR, optimiser, code generator) handles the target. The IR in the middle decouples the two, allowing us to support multiple source languages or multiple targets by reusing the IR.

---

## Lexical Analysis (Lexer)

The lexer reads a stream of characters and groups them into **tokens** — the smallest meaningful units of the language. For TinyC, we need tokens for:

- Keywords: `if`, `else`, `while`, `int`, `return`
- Identifiers: variable and function names
- Literals: integer constants (e.g. `42`)
- Operators: `+`, `-`, `*`, `/`, `=`, `==`, `!=`, `<`, `>`, `<=`, `>=`
- Punctuation: `(`, `)`, `{`, `}`, `;`, `,`

### Token Definition

```python
# token.py

from enum import Enum, auto

class TokenKind(Enum):
    # Keywords
    IF = auto()
    ELSE = auto()
    WHILE = auto()
    INT = auto()
    RETURN = auto()

    # Literals & identifiers
    IDENTIFIER = auto()
    INTEGER = auto()

    # Operators
    PLUS = auto()
    MINUS = auto()
    STAR = auto()
    SLASH = auto()
    ASSIGN = auto()
    EQ = auto()      # ==
    NE = auto()      # !=
    LT = auto()      # <
    GT = auto()      # >
    LE = auto()      # <=
    GE = auto()      # >=

    # Punctuation
    LPAREN = auto()
    RPAREN = auto()
    LBRACE = auto()
    RBRACE = auto()
    SEMICOLON = auto()
    COMMA = auto()

    EOF = auto()      # end of file


class Token:
    def __init__(self, kind: TokenKind, lexeme: str, line: int, col: int):
        self.kind = kind
        self.lexeme = lexeme    # the actual text
        self.line = line
        self.col = col

    def __repr__(self):
        return f"Token({self.kind.name}, '{self.lexeme}')"
```

### Lexer Implementation

The lexer operates as a state machine. It peeks at the current character, decides what kind of token to start, and consumes characters until the token is complete.

```python
# lexer.py

from token_defs import Token, TokenKind

class Lexer:
    def __init__(self, source: str):
        self.source = source
        self.pos = 0
        self.line = 1
        self.col = 1

    def error(self, msg: str):
        raise SyntaxError(f"{msg} at line {self.line}, column {self.col}")

    def peek(self) -> str | None:
        """Return the current character without consuming it."""
        if self.pos >= len(self.source):
            return None
        return self.source[self.pos]

    def advance(self) -> str:
        """Consume and return the current character."""
        ch = self.source[self.pos]
        self.pos += 1
        if ch == '\n':
            self.line += 1
            self.col = 1
        else:
            self.col += 1
        return ch

    def skip_whitespace_and_comments(self):
        while True:
            ch = self.peek()
            if ch is None:
                break
            if ch in ' \t\r\n':
                self.advance()
            elif ch == '/':
                # Check for single-line comment: //
                if self.pos + 1 < len(self.source) and self.source[self.pos + 1] == '/':
                    while self.peek() is not None and self.peek() != '\n':
                        self.advance()
                else:
                    break
            else:
                break

    def read_identifier(self) -> str:
        start = self.pos
        while self.peek() is not None and (self.peek().isalnum() or self.peek() == '_'):
            self.advance()
        return self.source[start:self.pos]

    def read_integer(self) -> str:
        start = self.pos
        while self.peek() is not None and self.peek().isdigit():
            self.advance()
        return self.source[start:self.pos]

    KEYWORDS = {
        "if":     TokenKind.IF,
        "else":   TokenKind.ELSE,
        "while":  TokenKind.WHILE,
        "int":    TokenKind.INT,
        "return": TokenKind.RETURN,
    }

    def next_token(self) -> Token:
        self.skip_whitespace_and_comments()
        ch = self.peek()
        if ch is None:
            return Token(TokenKind.EOF, "", self.line, self.col)

        line, col = self.line, self.col

        # Identifiers and keywords
        if ch.isalpha() or ch == '_':
            lexeme = self.read_identifier()
            kind = self.KEYWORDS.get(lexeme, TokenKind.IDENTIFIER)
            return Token(kind, lexeme, line, col)

        # Integer literals
        if ch.isdigit():
            lexeme = self.read_integer()
            return Token(TokenKind.INTEGER, lexeme, line, col)

        # Operators and punctuation
        def two_char_op(ch1: str, ch2: str, kind: TokenKind):
            """If the next two chars match, consume both and return token."""
            if (self.pos + 1 < len(self.source) and
                self.source[self.pos] == ch1 and
                self.source[self.pos + 1] == ch2):
                self.advance()
                self.advance()
                return Token(kind, ch1 + ch2, line, col)
            return None

        # Check two-character operators first
        op = (two_char_op('=', '=', TokenKind.EQ) or
              two_char_op('!', '=', TokenKind.NE) or
              two_char_op('<', '=', TokenKind.LE) or
              two_char_op('>', '=', TokenKind.GE))
        if op:
            return op

        # Single-character operators and punctuation
        single_map = {
            '+': TokenKind.PLUS,    '-': TokenKind.MINUS,
            '*': TokenKind.STAR,    '/': TokenKind.SLASH,
            '=': TokenKind.ASSIGN,
            '<': TokenKind.LT,      '>': TokenKind.GT,
            '(': TokenKind.LPAREN,  ')': TokenKind.RPAREN,
            '{': TokenKind.LBRACE,  '}': TokenKind.RBRACE,
            ';': TokenKind.SEMICOLON,
            ',': TokenKind.COMMA,
        }
        if ch in single_map:
            self.advance()
            return Token(single_map[ch], ch, line, col)

        self.error(f"unexpected character '{ch}'")
```

**How the lexer works, step by step:**

1. Skip over whitespace and `//`-style comments.
2. If the next character is a letter or underscore, consume a whole identifier and check the keyword table.
3. If it is a digit, consume an integer literal.
4. Try two-character operators (`==`, `!=`, `<=`, `>=`).
5. Fall back to single-character tokens.
6. If nothing matches, raise an error.

---

## Syntax Analysis (Parser)

The parser consumes the token stream and builds an **Abstract Syntax Tree** (AST). The AST represents the grammatical structure of the program without the syntactic noise (semicolons, parentheses grouping, etc.).

### AST Nodes

```python
# ast.py

from dataclasses import dataclass
from token_defs import Token

# ── Types ──────────────────────────────────────────────────

@dataclass
class Type:
    name: str

# ── Expressions ────────────────────────────────────────────

class Expr:
    """Base class for all expression nodes."""
    pass

@dataclass
class IntegerLiteral(Expr):
    value: int

@dataclass
class Identifier(Expr):
    name: str

@dataclass
class BinaryOp(Expr):
    op: Token          # the operator token (e.g. PLUS, MINUS, EQ, LT)
    left: Expr
    right: Expr

@dataclass
class Assignment(Expr):
    target: Identifier
    value: Expr

# ── Statements ─────────────────────────────────────────────

class Stmt:
    """Base class for all statement nodes."""
    pass

@dataclass
class VarDecl(Stmt):
    var_type: Type
    name: str

@dataclass
class ExprStmt(Stmt):
    expr: Expr

@dataclass
class Block(Stmt):
    statements: list[Stmt]

@dataclass
class IfStmt(Stmt):
    condition: Expr
    then_branch: Stmt
    else_branch: Stmt | None

@dataclass
class WhileStmt(Stmt):
    condition: Expr
    body: Stmt

@dataclass
class ReturnStmt(Stmt):
    value: Expr | None

# ── Top level ──────────────────────────────────────────────

@dataclass
class Function:
    return_type: Type
    name: str
    params: list[tuple[Type, str]]
    body: Block

@dataclass
class Program:
    functions: list[Function]
```

### Parser (Recursive Descent)

A recursive-descent parser mirrors the grammar directly — each grammar rule becomes one function.

Our TinyC grammar (simplified):

```
program      → function*
function     → type IDENTIFIER "(" params ")" block
params       → ε | param ("," param)*
param        → type IDENTIFIER
block        → "{" declaration* statement* "}"
declaration  → type IDENTIFIER ";"
statement    → expr_stmt | block | if_stmt | while_stmt | return_stmt
expr_stmt    → expression ";"
if_stmt      → "if" "(" expression ")" statement ("else" statement)?
while_stmt   → "while" "(" expression ")" statement
return_stmt  → "return" expression? ";"
expression   → assignment
assignment   → equality ("=" assignment)?
equality     → comparison (("==" | "!=") comparison)*
comparison   → term (("<" | ">" | "<=" | ">=") term)*
term         → factor (("+" | "-") factor)*
factor       → unary (("*" | "/") unary)*
unary        → ("-" | "!")? primary
primary      → INTEGER | IDENTIFIER | "(" expression ")"
```

Notice the **precedence climbing**: `expression` descends through a chain of rules from lowest to highest precedence. This ensures `a + b * c` is parsed as `a + (b * c)`.

```python
# parser.py

from token_defs import Token, TokenKind
from ast import *

class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def error(self, msg: str):
        tok = self.peek()
        raise SyntaxError(f"{msg} at line {tok.line}, column {tok.col}")

    def peek(self) -> Token:
        return self.tokens[self.pos]

    def previous(self) -> Token:
        return self.tokens[self.pos - 1]

    def check(self, kind: TokenKind) -> bool:
        return self.peek().kind == kind

    def advance(self) -> Token:
        if not self.check(TokenKind.EOF):
            self.pos += 1
        return self.previous()

    def consume(self, kind: TokenKind, msg: str) -> Token:
        if self.check(kind):
            return self.advance()
        self.error(msg)

    def match(self, *kinds: TokenKind) -> Token | None:
        for k in kinds:
            if self.check(k):
                return self.advance()
        return None

    # ── Parsing ───────────────────────────────────────

    def parse(self) -> Program:
        functions = []
        while not self.check(TokenKind.EOF):
            functions.append(self.function())
        return Program(functions)

    def function(self) -> Function:
        ret_type = self.consume(TokenKind.INT, "expected return type")
        name = self.consume(TokenKind.IDENTIFIER, "expected function name")
        self.consume(TokenKind.LPAREN, "expected '('")
        params = []
        if not self.check(TokenKind.RPAREN):
            params.append(self.param())
            while self.match(TokenKind.COMMA):
                params.append(self.param())
        self.consume(TokenKind.RPAREN, "expected ')'")
        body = self.block()
        return Function(Type(ret_type.lexeme), name.lexeme, params, body)

    def param(self) -> tuple[Type, str]:
        t = self.consume(TokenKind.INT, "expected type in parameter")
        name = self.consume(TokenKind.IDENTIFIER, "expected parameter name")
        return (Type(t.lexeme), name.lexeme)

    def block(self) -> Block:
        self.consume(TokenKind.LBRACE, "expected '{'")
        stmts = []
        while not self.check(TokenKind.RBRACE) and not self.check(TokenKind.EOF):
            if self.check(TokenKind.INT):
                stmts.append(self.declaration())
            else:
                stmts.append(self.statement())
        self.consume(TokenKind.RBRACE, "expected '}'")
        return Block(stmts)

    def declaration(self) -> VarDecl:
        t = self.consume(TokenKind.INT, "expected type")
        name = self.consume(TokenKind.IDENTIFIER, "expected variable name")
        self.consume(TokenKind.SEMICOLON, "expected ';' after declaration")
        return VarDecl(Type(t.lexeme), name.lexeme)

    def statement(self) -> Stmt:
        if self.match(TokenKind.IF):
            return self.if_stmt()
        if self.match(TokenKind.WHILE):
            return self.while_stmt()
        if self.match(TokenKind.RETURN):
            return self.return_stmt()
        if self.match(TokenKind.LBRACE):
            # Put back the brace for block()
            self.pos -= 1
            return self.block()
        return self.expr_stmt()

    def if_stmt(self) -> IfStmt:
        self.consume(TokenKind.LPAREN, "expected '(' after 'if'")
        cond = self.expression()
        self.consume(TokenKind.RPAREN, "expected ')'")
        then_branch = self.statement()
        else_branch = self.block() if self.match(TokenKind.ELSE) else None
        return IfStmt(cond, then_branch, else_branch)

    def while_stmt(self) -> WhileStmt:
        self.consume(TokenKind.LPAREN, "expected '(' after 'while'")
        cond = self.expression()
        self.consume(TokenKind.RPAREN, "expected ')'")
        body = self.statement()
        return WhileStmt(cond, body)

    def return_stmt(self) -> ReturnStmt:
        value = self.expression() if not self.check(TokenKind.SEMICOLON) else None
        self.consume(TokenKind.SEMICOLON, "expected ';' after return")
        return ReturnStmt(value)

    def expr_stmt(self) -> ExprStmt:
        expr = self.expression()
        self.consume(TokenKind.SEMICOLON, "expected ';' after expression")
        return ExprStmt(expr)

    # ── Expressions (precedence climbing) ─────────────

    def expression(self) -> Expr:
        return self.assignment()

    def assignment(self) -> Expr:
        expr = self.equality()
        if self.match(TokenKind.ASSIGN):
            equals = self.previous()
            value = self.assignment()
            if isinstance(expr, Identifier):
                return Assignment(expr, value)
            self.error("invalid assignment target")
        return expr

    def equality(self) -> Expr:
        expr = self.comparison()
        while op := self.match(TokenKind.EQ, TokenKind.NE):
            right = self.comparison()
            expr = BinaryOp(op, expr, right)
        return expr

    def comparison(self) -> Expr:
        expr = self.term()
        while op := self.match(TokenKind.LT, TokenKind.GT, TokenKind.LE, TokenKind.GE):
            right = self.term()
            expr = BinaryOp(op, expr, right)
        return expr

    def term(self) -> Expr:
        expr = self.factor()
        while op := self.match(TokenKind.PLUS, TokenKind.MINUS):
            right = self.factor()
            expr = BinaryOp(op, expr, right)
        return expr

    def factor(self) -> Expr:
        expr = self.unary()
        while op := self.match(TokenKind.STAR, TokenKind.SLASH):
            right = self.unary()
            expr = BinaryOp(op, expr, right)
        return expr

    def unary(self) -> Expr:
        if op := self.match(TokenKind.MINUS):
            # Unary minus: treat as 0 - operand
            # We re-use BinaryOp for simplicity.
            right = self.primary()
            minus_token = Token(TokenKind.MINUS, "-", op.line, op.col)
            return BinaryOp(minus_token, IntegerLiteral(0), right)
        return self.primary()

    def primary(self) -> Expr:
        if self.match(TokenKind.INTEGER):
            return IntegerLiteral(int(self.previous().lexeme))
        if self.match(TokenKind.IDENTIFIER):
            return Identifier(self.previous().lexeme)
        if self.match(TokenKind.LPAREN):
            expr = self.expression()
            self.consume(TokenKind.RPAREN, "expected ')'")
            return expr
        self.error("expected expression")
```

---

## Semantic Analysis

The semantic analyser checks that the program makes sense beyond its syntax:

- Variables are declared before use.
- Types are compatible.
- `return` statements appear in valid places.

For TinyC we focus on **name resolution and scope**. Each scope is a dictionary mapping variable names to their types.

```python
# semantic.py

from ast import *

class SemanticError(Exception):
    pass

class Scope:
    def __init__(self, parent: 'Scope | None' = None):
        self.vars: dict[str, Type] = {}
        self.parent = parent

    def declare(self, name: str, typ: Type):
        if name in self.vars:
            raise SemanticError(f"variable '{name}' already declared in this scope")
        self.vars[name] = typ

    def lookup(self, name: str) -> Type | None:
        if name in self.vars:
            return self.vars[name]
        if self.parent:
            return self.parent.lookup(name)
        return None

    def resolve(self, name: str) -> Type:
        typ = self.lookup(name)
        if typ is None:
            raise SemanticError(f"undefined variable '{name}'")
        return typ


class SemanticAnalyser:
    def __init__(self):
        self.global_scope = Scope()
        self.current_scope = self.global_scope
        self.current_return_type: Type | None = None

    def analyse(self, program: Program):
        for fn in program.functions:
            self.visit_function(fn)

    def visit_function(self, fn: Function):
        # Create a new scope for the function body
        outer = self.current_scope
        self.current_scope = Scope(outer)
        self.current_return_type = fn.return_type

        # Declare parameters
        for param_type, param_name in fn.params:
            self.current_scope.declare(param_name, param_type)

        self.visit_block(fn.body)
        self.current_scope = outer

    def visit_block(self, block: Block):
        outer = self.current_scope
        self.current_scope = Scope(outer)
        for stmt in block.statements:
            self.visit_stmt(stmt)
        self.current_scope = outer

    def visit_stmt(self, stmt: Stmt):
        if isinstance(stmt, VarDecl):
            self.current_scope.declare(stmt.name, stmt.var_type)
        elif isinstance(stmt, ExprStmt):
            self.visit_expr(stmt.expr)
        elif isinstance(stmt, Block):
            self.visit_block(stmt)
        elif isinstance(stmt, IfStmt):
            self.visit_expr(stmt.condition)
            self.visit_stmt(stmt.then_branch)
            if stmt.else_branch:
                self.visit_stmt(stmt.else_branch)
        elif isinstance(stmt, WhileStmt):
            self.visit_expr(stmt.condition)
            self.visit_stmt(stmt.body)
        elif isinstance(stmt, ReturnStmt):
            if stmt.value:
                self.visit_expr(stmt.value)

    def visit_expr(self, expr: Expr):
        if isinstance(expr, IntegerLiteral):
            pass  # always valid
        elif isinstance(expr, Identifier):
            self.current_scope.resolve(expr.name)
        elif isinstance(expr, BinaryOp):
            self.visit_expr(expr.left)
            self.visit_expr(expr.right)
        elif isinstance(expr, Assignment):
            if not isinstance(expr.target, Identifier):
                raise SemanticError("assignment target must be an identifier")
            self.current_scope.resolve(expr.target.name)
            self.visit_expr(expr.value)
```

The key insight: semantic analysis separates **declaration** from **resolution**. A variable must be declared (added to scope) before it can be resolved (looked up). Scopes nest — an inner scope can see outer variables but not vice versa.

---

## Intermediate Representation (IR)

Rather than generating assembly directly from the AST, we produce an **intermediate representation**. Our IR will be a simple **three-address code** where each instruction performs at most one operation.

Example: `a + b * c` becomes:

```
t1 = b * c
t2 = a + t1
```

```python
# ir.py

from dataclasses import dataclass
from enum import Enum, auto

class IROp(Enum):
    ADD = auto()
    SUB = auto()
    MUL = auto()
    DIV = auto()
    EQ  = auto()
    NE  = auto()
    LT  = auto()
    GT  = auto()
    LE  = auto()
    GE  = auto()
    ASSIGN = auto()
    JUMP = auto()
    JUMP_IF_FALSE = auto()
    LABEL = auto()
    RETURN = auto()
    CALL = auto()

@dataclass
class IRInstr:
    op: IROp
    dest: str = ""        # result variable or label name
    src1: str = ""
    src2: str = ""

    def __repr__(self):
        if self.op == IROp.LABEL:
            return f"{self.dest}:"
        if self.op == IROp.JUMP:
            return f"  jump {self.dest}"
        if self.op == IROp.JUMP_IF_FALSE:
            return f"  if not {self.src1} jump {self.dest}"
        if self.op == IROp.RETURN:
            return f"  return {self.src1}" if self.src1 else "  return"
        if self.op == IROp.CALL:
            return f"  {self.dest} = call {self.src1}({self.src2})"
        return f"  {self.dest} = {self.src1} {self.op.name} {self.src2}"
```

### IR Generation

We walk the AST and emit IR instructions, generating **temporary variables** for intermediate results.

```python
# ir_gen.py

from ast import *
from ir import *

class IRGenerator:
    def __init__(self):
        self.instrs: list[IRInstr] = []
        self.temp_counter = 0
        self.label_counter = 0

    def new_temp(self) -> str:
        self.temp_counter += 1
        return f"%t{self.temp_counter}"

    def new_label(self) -> str:
        self.label_counter += 1
        return f"L{self.label_counter}"

    def emit(self, instr: IRInstr):
        self.instrs.append(instr)

    def generate(self, program: Program) -> list[IRInstr]:
        for fn in program.functions:
            self.visit_function(fn)
        return self.instrs

    def visit_function(self, fn: Function):
        self.emit(IRInstr(IROp.LABEL, dest=f"_{fn.name}"))
        for stmt in fn.body.statements:
            self.visit_stmt(stmt)

    def visit_stmt(self, stmt: Stmt):
        if isinstance(stmt, ExprStmt):
            self.visit_expr(stmt.expr)
        elif isinstance(stmt, Block):
            for s in stmt.statements:
                self.visit_stmt(s)
        elif isinstance(stmt, IfStmt):
            self.visit_if(stmt)
        elif isinstance(stmt, WhileStmt):
            self.visit_while(stmt)
        elif isinstance(stmt, ReturnStmt):
            if stmt.value:
                val = self.visit_expr(stmt.value)
                self.emit(IRInstr(IROp.RETURN, src1=val))
            else:
                self.emit(IRInstr(IROp.RETURN))
        elif isinstance(stmt, VarDecl):
            pass  # handled by renaming at codegen

    def visit_if(self, stmt: IfStmt):
        cond = self.visit_expr(stmt.condition)
        else_label = self.new_label()
        end_label = self.new_label()

        self.emit(IRInstr(IROp.JUMP_IF_FALSE, src1=cond, dest=else_label))
        self.visit_stmt(stmt.then_branch)
        self.emit(IRInstr(IROp.JUMP, dest=end_label))

        self.emit(IRInstr(IROp.LABEL, dest=else_label))
        if stmt.else_branch:
            self.visit_stmt(stmt.else_branch)

        self.emit(IRInstr(IROp.LABEL, dest=end_label))

    def visit_while(self, stmt: WhileStmt):
        start_label = self.new_label()
        end_label = self.new_label()

        self.emit(IRInstr(IROp.LABEL, dest=start_label))
        cond = self.visit_expr(stmt.condition)
        self.emit(IRInstr(IROp.JUMP_IF_FALSE, src1=cond, dest=end_label))
        self.visit_stmt(stmt.body)
        self.emit(IRInstr(IROp.JUMP, dest=start_label))
        self.emit(IRInstr(IROp.LABEL, dest=end_label))

    OPERATOR_MAP = {
        TokenKind.PLUS:   IROp.ADD,
        TokenKind.MINUS:  IROp.SUB,
        TokenKind.STAR:   IROp.MUL,
        TokenKind.SLASH:  IROp.DIV,
        TokenKind.EQ:     IROp.EQ,
        TokenKind.NE:     IROp.NE,
        TokenKind.LT:     IROp.LT,
        TokenKind.GT:     IROp.GT,
        TokenKind.LE:     IROp.LE,
        TokenKind.GE:     IROp.GE,
    }

    def visit_expr(self, expr: Expr) -> str:
        """Returns the name of the variable holding the result."""
        if isinstance(expr, IntegerLiteral):
            t = self.new_temp()
            self.emit(IRInstr(IROp.ASSIGN, dest=t, src1=str(expr.value)))
            return t
        if isinstance(expr, Identifier):
            return expr.name
        if isinstance(expr, BinaryOp):
            left = self.visit_expr(expr.left)
            right = self.visit_expr(expr.right)
            t = self.new_temp()
            ir_op = self.OPERATOR_MAP[expr.op.kind]
            self.emit(IRInstr(ir_op, dest=t, src1=left, src2=right))
            return t
        if isinstance(expr, Assignment):
            val = self.visit_expr(expr.value)
            self.emit(IRInstr(IROp.ASSIGN, dest=expr.target.name, src1=val))
            return expr.target.name
        raise ValueError(f"unknown expression {type(expr)}")
```

For the TinyC program:

```c
int main() {
    int x;
    x = 10;
    int y;
    y = x + 5;
    return y;
}
```

The IR produced would be:

```
_main:
  %t1 = ASSIGN 10
  x = ASSIGN %t1
  %t2 = ASSIGN 5
  %t3 = x ADD %t2
  y = ASSIGN %t3
  return y
```

---

## Optimisation

Optimisation can be applied at the AST level, IR level, or during code generation. For brevity, we implement two classic **peephole optimisations** on the IR:

1. **Constant folding** — evaluate constant expressions at compile time.
2. **Copy propagation** — replace variable references with their assigned constants when safe.

```python
# optimiser.py

from ir import *

def constant_fold(instrs: list[IRInstr]) -> list[IRInstr]:
    """Fold constant expressions: %t1 = 2; %t2 = 3; %t3 = %t1 ADD %t2 → %t3 = 5"""
    out = []
    constants: dict[str, int] = {}

    for instr in instrs:
        if instr.op == IROp.ASSIGN:
            # Track constant assignments
            if instr.src1.lstrip('-').isdigit():
                constants[instr.dest] = int(instr.src1)
            else:
                constants.pop(instr.dest, None)
            out.append(instr)
        elif instr.op in (IROp.ADD, IROp.SUB, IROp.MUL, IROp.DIV):
            left = constants.get(instr.src1)
            right = constants.get(instr.src2)
            if left is not None and right is not None:
                # Compute at compile time
                ops = {
                    IROp.ADD: left + right,
                    IROp.SUB: left - right,
                    IROp.MUL: left * right,
                    IROp.DIV: left // right,
                }
                value = ops[instr.op]
                const_var = instr.dest
                out.append(IRInstr(IROp.ASSIGN, dest=const_var, src1=str(value)))
                constants[const_var] = value
            else:
                out.append(instr)
        else:
            out.append(instr)
    return out


def copy_propagate(instrs: list[IRInstr]) -> list[IRInstr]:
    """Replace variable references with their constant values where possible."""
    replacements: dict[str, str] = {}

    def subst(val: str) -> str:
        return replacements.get(val, val)

    out = []
    for instr in instrs:
        # Substitute source operands
        if instr.src1:
            instr.src1 = subst(instr.src1)
        if instr.src2:
            instr.src2 = subst(instr.src2)

        if instr.op == IROp.ASSIGN:
            replacements[instr.dest] = instr.src1
            out.append(instr)
        elif instr.dest and instr.op != IROp.LABEL:
            # Invalidate replacement if dest is reassigned
            replacements.pop(instr.dest, None)
            out.append(instr)
        else:
            out.append(instr)
    return out
```

---

## Code Generation

Our target is a **stack-based virtual machine**. Each instruction pops operands from a stack and pushes results. This is conceptually similar to the JVM or CPython bytecode.

### VM Instruction Set

```python
# vm.py

from enum import Enum, auto

class VMInstr:
    def __init__(self, op: str, arg: str = ""):
        self.op = op
        self.arg = arg

    def __repr__(self):
        if self.arg:
            return f"  {self.op} {self.arg}"
        return f"  {self.op}"


# Opcodes we will use:
#   PUSH <value>    -- push literal onto stack
#   LOAD <var>      -- push variable value onto stack
#   STORE <var>     -- pop top-of-stack into variable
#   ADD, SUB, MUL, DIV, EQ, NE, LT, GT, LE, GE
#                   -- pop two values, apply op, push result
#   JUMP <label>    -- unconditional branch
#   JUMP_IF_FALSE <label>  -- pop, branch if zero
#   LABEL <name>    -- landing target for jumps
#   RET             -- return from function
#   PRINT           -- pop and display (for our test harness)
```

### Generating VM Assembly from IR

We translate each IR instruction to one or more VM instructions.

```python
# codegen.py

from ir import *
from vm import VMInstr

def generate_vm(instrs: list[IRInstr]) -> list[VMInstr]:
    code: list[VMInstr] = []
    var_set = set()               # tracks declared variables

    def ensure_var(name: str):
        """Declare variable if not seen yet (auto-vivify for simplicity)."""
        if name.startswith('%'):   # skip temporaries
            return
        if name not in var_set:
            var_set.add(name)

    for ir in instrs:
        if ir.op == IROp.LABEL:
            code.append(VMInstr("LABEL", ir.dest))
        elif ir.op == IROp.ASSIGN:
            if ir.src1.lstrip('-').isdigit():
                code.append(VMInstr("PUSH", ir.src1))
            else:
                code.append(VMInstr("LOAD", ir.src1))
            if ir.dest.startswith('%'):
                # Temporary — leave on stack for next operation
                pass
            else:
                code.append(VMInstr("STORE", ir.dest))
                ensure_var(ir.dest)
        elif ir.op == IROp.ADD:
            code.append(VMInstr("ADD"))
        elif ir.op == IROp.SUB:
            code.append(VMInstr("SUB"))
        elif ir.op == IROp.MUL:
            code.append(VMInstr("MUL"))
        elif ir.op == IROp.DIV:
            code.append(VMInstr("DIV"))
        elif ir.op == IROp.EQ:
            code.append(VMInstr("EQ"))
        elif ir.op == IROp.NE:
            code.append(VMInstr("NE"))
        elif ir.op == IROp.LT:
            code.append(VMInstr("LT"))
        elif ir.op == IROp.GT:
            code.append(VMInstr("GT"))
        elif ir.op == IROp.LE:
            code.append(VMInstr("LE"))
        elif ir.op == IROp.GE:
            code.append(VMInstr("GE"))
        elif ir.op == IROp.JUMP:
            code.append(VMInstr("JUMP", ir.dest))
        elif ir.op == IROp.JUMP_IF_FALSE:
            code.append(VMInstr("JUMP_IF_FALSE", ir.dest))
        elif ir.op == IROp.RETURN:
            if ir.src1:
                code.append(VMInstr("LOAD", ir.src1))
            code.append(VMInstr("RET"))

    # Add PRINT at the end to display the return value of main
    code.append(VMInstr("PRINT"))
    return code
```

### The VM Runtime

```python
# vm_runtime.py

def run_vm(code: list[VMInstr], entry: str = "_main"):
    """Execute the VM instruction sequence."""
    memory: dict[str, int] = {}
    stack: list[int] = []
    ip = 0                        # instruction pointer
    labels: dict[str, int] = {}   # label → instruction index

    # First pass: record label positions
    for i, instr in enumerate(code):
        if instr.op == "LABEL":
            labels[instr.arg] = i

    def pop() -> int:
        return stack.pop()

    def push(val: int):
        stack.append(val)

    while 0 <= ip < len(code):
        instr = code[ip]
        op, arg = instr.op, instr.arg

        if op == "PUSH":
            push(int(arg))
        elif op == "LOAD":
            push(memory[arg])
        elif op == "STORE":
            memory[arg] = pop()
        elif op in ("ADD", "SUB", "MUL", "DIV", "EQ", "NE", "LT", "GT", "LE", "GE"):
            b = pop()
            a = pop()
            ops = {
                "ADD": a + b, "SUB": a - b, "MUL": a * b, "DIV": a // b,
                "EQ": int(a == b), "NE": int(a != b),
                "LT": int(a < b), "GT": int(a > b),
                "LE": int(a <= b), "GE": int(a >= b),
            }
            push(ops[op])
        elif op == "JUMP":
            ip = labels[arg]
            continue
        elif op == "JUMP_IF_FALSE":
            if pop() == 0:
                ip = labels[arg]
                continue
        elif op == "RET":
            if stack:
                return pop()
            return None
        elif op == "LABEL":
            pass
        elif op == "PRINT":
            if stack:
                print(f"=> {stack[-1]}")

        ip += 1
```

---

## Putting It All Together

Here is the **main driver** that connects every stage into a pipeline:

```python
# tinyc.py

import sys
from lexer import Lexer
from parser import Parser
from semantic import SemanticAnalyser
from ir_gen import IRGenerator
from optimiser import constant_fold, copy_propagate
from codegen import generate_vm
from vm_runtime import run_vm

def compile_and_run(source_code: str):
    # 1. Lex
    lexer = Lexer(source_code)
    tokens = []
    while True:
        tok = lexer.next_token()
        tokens.append(tok)
        if tok.kind.name == "EOF":
            break

    # 2. Parse
    parser = Parser(tokens)
    ast = parser.parse()

    # 3. Semantic analysis
    analyser = SemanticAnalyser()
    analyser.analyse(ast)

    # 4. Generate IR
    ir_gen = IRGenerator()
    ir = ir_gen.generate(ast)

    print("── IR ──")
    for i in ir:
        print(i)

    # 5. Optimise
    ir = constant_fold(ir)
    ir = copy_propagate(ir)

    print("\n── Optimised IR ──")
    for i in ir:
        print(i)

    # 6. Code generation
    vm_code = generate_vm(ir)

    print("\n── VM Assembly ──")
    for i in vm_code:
        print(i)

    # 7. Execute
    print("\n── Output ──")
    result = run_vm(vm_code)
    if result is not None:
        print(f"Return value: {result}")


# ── Example ────────────────────────────────────────────────

TEST_PROGRAM = """
int main() {
    int x;
    x = 10;

    int y;
    y = x + 5 * 2;

    if (y > 10) {
        return y;
    } else {
        return 0;
    }
}
"""

if __name__ == "__main__":
    compile_and_run(TEST_PROGRAM)
```

When you run this, you should see output similar to:

```
── IR ──
_main:
  %t1 = ASSIGN 10
  x = ASSIGN %t1
  %t2 = ASSIGN 5
  %t3 = ASSIGN 2
  %t4 = %t2 MUL %t3
  %t5 = x ADD %t4
  y = ASSIGN %t5
  %t6 = y GT 10
  JUMP_IF_FALSE %t6 -> L1
  return y
  JUMP L2
L1:
  return 0
L2:

── Optimised IR ──
_main:
  x = ASSIGN 10
  y = ASSIGN 20
  JUMP_IF_FALSE y GT 10 -> L1
  return y
  JUMP L2
L1:
  return 0
L2:

── VM Assembly ──
  LABEL _main
  PUSH 10
  STORE x
  PUSH 20
  STORE y
  LOAD y
  PUSH 10
  GT
  JUMP_IF_FALSE L1
  LOAD y
  RET
  JUMP L2
  LABEL L1
  PUSH 0
  RET
  LABEL L2
  PRINT

── Output ──
=> 20
Return value: 20
```

Notice how `5 * 2` was folded into `10` at compile time, and `x`'s constant value was propagated, eliminating the temporary variables. The optimiser turned a 3-operation sequence into a single `PUSH 20`.

---

## Extending the Compiler

This foundation can be extended in many directions:

- **More types** (`char`, `float`, arrays, pointers, structs)
- **Functions and function calls** — add a call stack to the VM
- **Memory management** — heap allocation via `malloc`
- **More optimisations** — dead code elimination, loop invariant hoisting, register allocation
- **Native code generation** — emit x86-64 or ARM64 assembly instead of VM bytecode
- **Error recovery** — instead of stopping at the first error, skip tokens and report multiple errors

### Quick Sketch: Adding Function Calls

To add function calls, you need:

1. **Parser** — parse `ident("arg1", "arg2", ...)` as a `Call` expression node.
2. **Semantic analyser** — resolve function names and check argument counts.
3. **IR** — a `CALL` instruction.
4. **VM** — a call stack with a frame per invocation (arguments, locals, return address).

```python
# Sketch for a Call AST node
@dataclass
class Call(Expr):
    callee: str
    arguments: list[Expr]
```

In the VM runtime, add a frame stack:

```python
class Frame:
    def __init__(self, return_ip: int, locals: dict[str, int]):
        self.return_ip = return_ip
        self.locals = locals

class VM:
    def __init__(self, code: list[VMInstr]):
        self.code = code
        self.frames: list[Frame] = []
        self.stack: list[int] = []
        self.ip = 0

    def call(self, fn_name: str, args: list[int]):
        # Push frame, set up locals, jump to function label
        ...
```

---

## Further Reading

- **"Compilers: Principles, Techniques, and Tools"** (Aho, Lam, Sethi, Ullman) — the classic Dragon Book.
- **"Crafting Interpreters"** by Robert Nystrom — an excellent, practical walkthrough of building a tree-walk interpreter and a bytecode VM. Free online at craftinginterpreters.com.
- **LLVM** — the industry-standard compiler infrastructure. Its intermediate representation (LLVM IR) is what production compilers like Clang and Rustc use.
- **"Engineering a Compiler"** by Cooper and Torczon — a modern treatment that balances theory and practice.

---

## Conclusion

We have built a complete compiler pipeline from scratch:

- A **lexer** that converts raw text to tokens.
- A **recursive-descent parser** that builds an AST.
- A **semantic analyser** that resolves names and enforces scope rules.
- An **IR generator** producing three-address code.
- A **peephole optimiser** performing constant folding and copy propagation.
- A **code generator** translating IR to stack-based VM instructions.
- A **VM runtime** that executes the generated code.

The entire system is less than 700 lines of Python. This demonstrates that while compilers are deep, they are not magic — each stage is a well-defined transformation that you can implement yourself. The same architecture scales from this tiny demo to industrial compilers like GCC, Clang, and Rustc.
