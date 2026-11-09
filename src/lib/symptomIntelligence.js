export async function exploreSymptomResearch(answers) {
  const response = await fetch('/api/symptom-intelligence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ answers: answers.map(({ questionKey, value, label, text }) => ({ questionKey, value, label, text })) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Research could not be prepared. Please try again.');
  return result;
}
