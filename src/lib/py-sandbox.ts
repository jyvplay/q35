/**
 * Deterministic Python-like Sandbox Runtime
 * Safe expression evaluator for arithmetic, comparisons, finance/temporal helpers.
 * No eval(), no arbitrary code — pure AST parsing and interpretation.
 */

type Expr =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "call"; func: string; args: Expr[] }
  | { type: "binop"; op: string; left: Expr; right: Expr }
  | { type: "unop"; op: string; operand: Expr }
  | { type: "ident"; name: string };

const HELPERS: Record<string, (...args: any[]) => any> = {
  abs: (x: number) => Math.abs(x),
  round: (x: number, d = 0) => Number(x.toFixed(d)),
  floor: (x: number) => Math.floor(x),
  ceil: (x: number) => Math.ceil(x),
  min: (...xs: number[]) => Math.min(...xs),
  max: (...xs: number[]) => Math.max(...xs),
  sqrt: (x: number) => Math.sqrt(x),
  pow: (x: number, y: number) => Math.pow(x, y),
  sum: (...xs: number[]) => xs.reduce((a, b) => a + b, 0),
  avg: (...xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length,
  pct: (part: number, whole: number) => whole !== 0 ? (part / whole) * 100 : 0,
  pctChange: (from: number, to: number) => from !== 0 ? ((to - from) / from) * 100 : 0,
  npv: (rate: number, ...cashflows: number[]) => cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t + 1), 0),
  irr: (initial: number, ...cashflows: number[]) => {
    let r = 0.1;
    for (let i = 0; i < 100; i++) {
      const npvVal = cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t + 1), 0) - initial;
      const dnpv = cashflows.reduce((acc, cf, t) => acc + (-(t + 1) * cf) / Math.pow(1 + r, t + 2), 0);
      if (Math.abs(dnpv) < 1e-12) break;
      r -= npvVal / dnpv;
    }
    return r;
  },
  cagr: (begin: number, end: number, years: number) => years > 0 && begin > 0 ? Math.pow(end / begin, 1 / years) - 1 : 0,
  daysBetween: (ts1: number, ts2: number) => Math.floor(Math.abs(ts2 - ts1) / (1000 * 60 * 60 * 24)),
  mean: (...xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length,
  variance: (...xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((acc, x) => acc + Math.pow(x - m, 2), 0) / xs.length; },
  stdev: (...xs: number[]) => Math.sqrt(xs.reduce((acc, x) => acc + Math.pow(x - xs.reduce((a, b) => a + b, 0) / xs.length, 2), 0) / xs.length),
  len: (s: string) => s.length,
  upper: (s: string) => s.toUpperCase(),
  lower: (s: string) => s.toLowerCase(),
};

function tokenize(code: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < code.length && /[0-9.]/.test(code[i])) num += code[i++];
      tokens.push(num);
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) ident += code[i++];
      tokens.push(ident);
    } else if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = "";
      i++;
      while (i < code.length && code[i] !== quote) str += code[i++];
      i++;
      tokens.push(`"${str}"`);
    } else if (["==", "!=", "<=", ">=", "&&", "||"].includes(code.slice(i, i + 2))) {
      tokens.push(code.slice(i, i + 2));
      i += 2;
    } else if (["+", "-", "*", "/", "%", "^", "(", ")", ",", "[", "]", ">", "<", "=", "!"].includes(ch)) {
      tokens.push(ch);
      i++;
    } else { i++; }
  }
  return tokens;
}

class Parser {
  tokens: string[];
  pos = 0;
  constructor(tokens: string[]) { this.tokens = tokens; }
  peek(): string { return this.tokens[this.pos] ?? ""; }
  consume(): string { return this.tokens[this.pos++] ?? ""; }
  parse(): Expr { return this.parseExpr(); }
  parseExpr(): Expr { return this.parseComparison(); }
  parseComparison(): Expr {
    let left = this.parseAdditive();
    while (["==", "!=", "<=", ">=", "<", ">"].includes(this.peek())) {
      const op = this.consume();
      const right = this.parseAdditive();
      left = { type: "binop", op, left, right };
    }
    return left;
  }
  parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (["+", "-"].includes(this.peek())) {
      const op = this.consume();
      const right = this.parseMultiplicative();
      left = { type: "binop", op, left, right };
    }
    return left;
  }
  parseMultiplicative(): Expr {
    let left = this.parsePower();
    while (["*", "/", "%"].includes(this.peek())) {
      const op = this.consume();
      const right = this.parsePower();
      left = { type: "binop", op, left, right };
    }
    return left;
  }
  parsePower(): Expr {
    let left = this.parsePrimary();
    if (this.peek() === "^") {
      this.consume();
      const right = this.parsePrimary();
      left = { type: "binop", op: "^", left, right };
    }
    return left;
  }
  parsePrimary(): Expr {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end");
    if (/^[0-9.]+$/.test(tok)) { this.consume(); return { type: "num", value: parseFloat(tok) }; }
    if (tok.startsWith('"')) { this.consume(); return { type: "str", value: tok.slice(1, -1) }; }
    if (/^[a-zA-Z_]/.test(tok)) {
      this.consume();
      if (this.peek() === "(") {
        this.consume();
        const args: Expr[] = [];
        while (this.peek() !== ")") {
          args.push(this.parseExpr());
          if (this.peek() === ",") this.consume();
        }
        this.consume();
        return { type: "call", func: tok, args };
      }
      return { type: "ident", name: tok };
    }
    if (tok === "(") {
      this.consume();
      const expr = this.parseExpr();
      if (this.peek() === ")") this.consume();
      return expr;
    }
    throw new Error(`Unexpected: ${tok}`);
  }
}

function evaluate(expr: Expr, env: Record<string, any> = {}): any {
  switch (expr.type) {
    case "num": case "str": case "bool": return expr.value;
    case "ident": return env[expr.name] ?? 0;
    case "binop": {
      const l = evaluate(expr.left, env);
      const r = evaluate(expr.right, env);
      if (typeof l === "number" && typeof r === "number") {
        switch (expr.op) {
          case "+": return l + r; case "-": return l - r; case "*": return l * r;
          case "/": return r !== 0 ? l / r : 0; case "%": return l % r; case "^": return Math.pow(l, r);
          case "==": return l === r; case "!=": return l !== r;
          case "<": return l < r; case ">": return l > r; case "<=": return l <= r; case ">=": return l >= r;
        }
      }
      return 0;
    }
    case "unop": { const v = evaluate(expr.operand, env); return typeof v === "number" && expr.op === "-" ? -v : v; }
    case "call": {
      const args = expr.args.map(a => evaluate(a, env));
      const fn = HELPERS[expr.func];
      return fn ? fn(...args) : 0;
    }
    default: return 0;
  }
}

export interface SandboxResult { success: boolean; result: any; error?: string; trace?: string; }

export function runSandbox(code: string): SandboxResult {
  try {
    const tokens = tokenize(code);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const result = evaluate(ast);
    return { success: true, result, trace: `AST: ${JSON.stringify(ast).slice(0, 200)}` };
  } catch (err: any) {
    return { success: false, result: null, error: err.message };
  }
}

export const SANDBOX_TEMPLATES = [
  { label: "pctChange(from, to)", code: "pctChange(211.14, 308.81)" },
  { label: "round(pct(a, b), d)", code: "round(pct(57 + 41, 100), 1)" },
  { label: "daysBetween(ts1, ts2)", code: "daysBetween(0, 60 * 86400000)" },
  { label: "NPV", code: "npv(0.1, -100, 40, 50, 60)" },
  { label: "CAGR", code: "cagr(100, 250, 5)" },
  { label: "IRR", code: "irr(1000, 300, 400, 500)" },
  { label: "mean", code: "mean(10, 20, 30, 40, 50)" },
  { label: "stdev", code: "stdev(10, 20, 30, 40, 50)" },
];
