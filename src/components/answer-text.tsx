/** Renders an answer's text, honouring **bold** without interpreting any HTML. */
export function AnswerText({ text }: { readonly text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return (
    <p className="answer-text">
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={`b-${String(index)}`}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={`t-${String(index)}`}>{part}</span>
        ),
      )}
    </p>
  );
}
