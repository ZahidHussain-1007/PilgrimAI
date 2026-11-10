const prompts = [
  { icon: "⌖", label: "Find a place", description: "Discover a destination that calls to you" },
  { icon: "↗", label: "Shape a journey", description: "Bring the pieces of a trip together" },
  { icon: "☼", label: "Prepare to go", description: "Get ready for a meaningful visit" },
]

export function SuggestedPrompts({ onChoose }: { onChoose: (prompt: string) => void }) {
  return <div className="prompt-grid">{prompts.map((prompt) => <button className="prompt-card" key={prompt.label} onClick={() => onChoose(`${prompt.label}: `)}><span className="prompt-icon">{prompt.icon}</span><span><strong>{prompt.label}</strong><small>{prompt.description}</small></span><span className="prompt-arrow" aria-hidden="true">↗</span></button>)}</div>
}
