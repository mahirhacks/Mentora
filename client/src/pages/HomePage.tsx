import { Link, useNavigate } from "react-router-dom";
import { useTeachingStore } from "../state/teachingStore";

const SUGGESTIONS = [
  "Expanding (a+b)² with an area model",
  "Pythagorean theorem visually",
  "How photosynthesis works",
  "Basic derivatives for beginners",
  "Newton's three laws of motion",
];

export function HomePage() {
  const navigate = useNavigate();
  const setTopicRequest = useTeachingStore((s) => s.setTopicRequest);

  const startTopic = (raw: string) => {
    const topic = raw.trim();
    if (!topic) return;
    setTopicRequest(topic, `Teach me: ${topic}`);
    navigate(`/lesson?topic=${encodeURIComponent(topic)}`);
  };

  return (
    <section className="page home-page">
      <h1>Welcome back!</h1>
      <p className="lede">
        Ask Mentora <strong>anything</strong> — she&apos;ll plan a live
        whiteboard lesson for you.
      </p>
      <form
        className="ask-bar"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTopic(String(fd.get("q") ?? ""));
        }}
      >
        <input
          name="q"
          placeholder="Ask Mentora anything… e.g. teach me fractions"
          defaultValue=""
          autoFocus
        />
        <button type="submit" className="btn primary">
          Teach me
        </button>
      </form>

      <div className="recent">
        <h2>Try asking</h2>
        {SUGGESTIONS.map((s) => (
          <article key={s} className="topic-row">
            <div>
              <strong>{s}</strong>
              <p>Live voice + whiteboard</p>
            </div>
            <button type="button" className="btn" onClick={() => startTopic(s)}>
              Learn
            </button>
          </article>
        ))}
        <article className="topic-row">
          <div>
            <strong>Browse more topics</strong>
            <p>Or invent your own from the Lessons page</p>
          </div>
          <Link className="btn ghost" to="/lessons">
            Lessons
          </Link>
        </article>
      </div>
    </section>
  );
}
