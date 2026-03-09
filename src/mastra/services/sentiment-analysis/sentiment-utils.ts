export function analyzeSentiment(
  text: string,
): 'positive' | 'negative' | 'neutral' {
  const positiveWords = [
    'bullish', 'moon', 'pump', 'gains', 'profit', 'positive', 'up',
    'rise', 'growth', 'success', 'excellent', 'amazing', 'great', 'love', 'best',
  ];
  const negativeWords = [
    'bearish', 'dump', 'crash', 'loss', 'negative', 'down', 'fall',
    'decline', 'failure', 'drop', 'terrible', 'awful', 'hate', 'worst', 'scam',
  ];

  const lower = text.toLowerCase();
  const pos = positiveWords.filter((w) => lower.includes(w)).length;
  const neg = negativeWords.filter((w) => lower.includes(w)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

export function calculateSentimentScore(sentiments: string[]): number {
  const pos = sentiments.filter((s) => s === 'positive').length;
  const neg = sentiments.filter((s) => s === 'negative').length;
  const total = sentiments.length;
  if (total === 0) return 0;
  return ((pos - neg) / total) * 100;
}
