// Literal independently specified fixture, not derived from the production schema.
export function unavailableEvaluation() {
  return { evaluation: {
    script_narration: { rating: null, comment: 'No speech evidence to assess narration.' },
    camera_angles: { rating: null, comment: 'Insufficient visual evidence.' },
    audio: { rating: null, comment: 'No audio evidence available.' },
    content_sequencing: { rating: null, comment: 'Cannot establish sequence from available evidence.' },
    graphics: { rating: null, comment: 'No graphics evidence available.' },
    overall_impression: { rating: null, summary: 'Insufficient evidence for an overall rating.' },
  } };
}
