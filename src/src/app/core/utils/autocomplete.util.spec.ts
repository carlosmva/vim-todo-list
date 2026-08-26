import { normalizeAiCompletion } from './autocomplete.util';

describe('normalizeAiCompletion', () => {
  const dict = new Set(['week', 'need', 'important', 'send']);

  const opts = {
    dictHasWordLower: (word: string) => dict.has(word),
    isGluedDictWordsLower: () => false,
  };

  it('does not prepend a space when suffix completes a known word', () => {
    const result = normalizeAiCompletion('next we', 'ek', opts);
    expect(result).toEqual({ baseText: 'next we', completion: 'ek', kind: 'ai' });
  });

  it('prepends a space when continuing after a complete word', () => {
    const result = normalizeAiCompletion('Buy milk', 'and eggs', { ...opts, dictHasWordLower: (word) => dict.has(word) || word === 'milk' });
    expect(result).toEqual({ baseText: 'Buy milk', completion: ' and eggs', kind: 'ai' });
  });

  it('rejects mid-word completions that contain spaces', () => {
    const result = normalizeAiCompletion('This is rea', 'lly good', opts);
    expect(result).toBeNull();
  });

  it('does not keep a leading space when the base already ends with whitespace', () => {
    const result = normalizeAiCompletion('Buy milk ', 'and eggs', opts);
    expect(result).toEqual({ baseText: 'Buy milk ', completion: 'and eggs', kind: 'ai' });
  });
});
