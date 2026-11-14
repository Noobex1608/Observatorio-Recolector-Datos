import { evaluateArithmetic } from './arithmetic-expression';

describe('evaluateArithmetic', () => {
  it('respects parentheses, precedence and negative values', () => {
    expect(evaluateArithmetic('2 + 3 * (4 - 1)')).toBe(11);
    expect(evaluateArithmetic('-(2 + 3) / 2')).toBe(-2.5);
  });

  it('rejects executable input and invalid arithmetic', () => {
    expect(evaluateArithmetic('1;alert(1)')).toBeNull();
    expect(evaluateArithmetic('1/0')).toBeNull();
    expect(evaluateArithmetic('1+')).toBeNull();
  });
});
