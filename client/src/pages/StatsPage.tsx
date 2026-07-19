import { Link } from "react-router-dom";
import { useTeachingStore } from "../state/teachingStore";

export function StatsPage() {
  const runtime = useTeachingStore((s) => s.runtime);
  const hintsUsed = useTeachingStore((s) => s.hintsUsed);
  const plan = useTeachingStore((s) => s.plan);
  const topicRequest = useTeachingStore((s) => s.topicRequest);
  const topic = plan.topic || topicRequest || "practice";

  return (
    <section className="page">
      <h1>Stats</h1>
      <p className="lede">
        Latest session{plan.title ? `: ${plan.title}` : ""}.
      </p>
      <ul>
        <li>Understanding: {Math.round(runtime.understanding * 100)}%</li>
        <li>Questions asked: {runtime.questionsAsked}</li>
        <li>Hints used: {hintsUsed}</li>
        <li>Correct streak: {runtime.correctStreak}</li>
        <li>
          Phase: {runtime.phase}
          {runtime.startedAt
            ? ` · started ${new Date(runtime.startedAt).toLocaleTimeString()}`
            : ""}
        </li>
      </ul>
      <div className="control-row">
        <Link
          className="btn"
          to={`/lesson?topic=${encodeURIComponent(topic)}`}
        >
          Back to lesson
        </Link>
        <Link className="btn ghost" to="/lessons">
          Pick a topic
        </Link>
      </div>
    </section>
  );
}
