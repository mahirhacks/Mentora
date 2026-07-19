import { Link } from "react-router-dom";
import { useTeachingStore } from "../state/teachingStore";

export function SummaryPage() {
  const runtime = useTeachingStore((s) => s.runtime);
  const hintsUsed = useTeachingStore((s) => s.hintsUsed);
  const plan = useTeachingStore((s) => s.plan);
  const pct = Math.round(runtime.understanding * 100);
  const learned =
    plan.objectives.length > 0
      ? plan.objectives.slice(0, 3)
      : [
          `Ideas from ${plan.topic || "today's lesson"}`,
          "Visual explanations on the whiteboard",
          "Checked understanding with questions",
        ];

  return (
    <section className="page summary-page">
      <h1>Lesson summary</h1>
      <p className="lede">{plan.title || plan.topic}</p>
      <div className="summary-hero">
        <div className="gauge">
          <span className="gauge-pct">{pct}%</span>
          <div className="gauge-meter" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </div>
          <p>Understanding</p>
        </div>
        <div className="summary-stats">
          <p>
            <strong>{runtime.questionsAsked}</strong> Questions
          </p>
          <p>
            <strong>{hintsUsed}</strong> Hints used
          </p>
        </div>
      </div>
      <h2>What you learned</h2>
      <ul>
        {learned.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="control-row">
        <Link className="btn" to={`/lesson?topic=${encodeURIComponent(plan.topic || "practice")}`}>
          Practice more
        </Link>
        <Link className="btn ghost" to="/lessons">
          Next topic
        </Link>
      </div>
    </section>
  );
}
