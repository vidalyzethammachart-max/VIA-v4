// Decorative timeline: nine rubric categories as editing tracks, scanned once by a playhead.
type Segment = [start: number, length: number, tone?: "soft" | "hot"];

const TRACKS: Segment[][] = [
  [[0.02, 0.28], [0.36, 0.2, "hot"], [0.66, 0.26]],
  [[0.08, 0.18, "soft"], [0.3, 0.34], [0.72, 0.2, "hot"]],
  [[0.0, 0.14], [0.2, 0.22, "hot"], [0.5, 0.3, "soft"]],
  [[0.12, 0.3], [0.5, 0.14, "hot"], [0.7, 0.26]],
  [[0.04, 0.2, "soft"], [0.28, 0.26], [0.62, 0.18, "hot"], [0.84, 0.12]],
  [[0.1, 0.36, "hot"], [0.56, 0.3, "soft"]],
  [[0.0, 0.22], [0.3, 0.12, "soft"], [0.46, 0.28, "hot"], [0.8, 0.16]],
  [[0.16, 0.24], [0.46, 0.2, "hot"], [0.72, 0.24, "soft"]],
  [[0.06, 0.16, "hot"], [0.28, 0.4], [0.74, 0.2, "soft"]],
];

const RULER = ["0:00", "0:30", "1:00", "1:30", "2:00", "2:30", "3:00", "3:30", "4:00", "4:30"];

export default function LoginTimeline() {
  return (
    <div className="tl" aria-hidden="true">
      <div className="tl-ruler">
        {RULER.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="tl-rows">
        {TRACKS.map((segments, index) => (
          <div className="tl-row" key={index}>
            <span className="tl-num">{index + 1}</span>
            <div className="tl-track">
              {segments.map(([start, length, tone], segmentIndex) => (
                <span
                  key={segmentIndex}
                  className="tl-seg"
                  data-tone={tone}
                  style={{
                    left: `${start * 100}%`,
                    width: `${length * 100}%`,
                    ["--s" as string]: start,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="tl-playhead" />
    </div>
  );
}
