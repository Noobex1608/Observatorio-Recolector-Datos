/** Evaluates only numbers and the four basic arithmetic operators. */
export function evaluateArithmetic(expression: string): number | null {
  const source = expression.replace(/\s+/g, '');
  const tokens = source.match(/(?:\d+(?:\.\d+)?|\.\d+|[()+\-*/])/g);
  if (!tokens || tokens.join('') !== source) return null;

  let index = 0;
  const primary = (): number | null => {
    const token = tokens[index++];
    if (token === '+' || token === '-') {
      const value = primary();
      return value === null ? null : token === '-' ? -value : value;
    }
    if (token === '(') {
      const value = parse(0);
      if (tokens[index++] !== ')') return null;
      return value;
    }
    return token !== undefined && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)
      ? Number(token) : null;
  };
  const precedence = (token: string | undefined): number =>
    token === '*' || token === '/' ? 2 : token === '+' || token === '-' ? 1 : -1;
  const parse = (minimum: number): number | null => {
    let left = primary();
    if (left === null) return null;
    while (precedence(tokens[index]) >= minimum) {
      const operator = tokens[index++];
      const right = parse(precedence(operator) + 1);
      if (right === null) return null;
      left = operator === '+' ? left + right : operator === '-' ? left - right
        : operator === '*' ? left * right : left / right;
      if (!Number.isFinite(left)) return null;
    }
    return left;
  };

  const result = parse(0);
  return result !== null && index === tokens.length && Number.isFinite(result) ? result : null;
}
