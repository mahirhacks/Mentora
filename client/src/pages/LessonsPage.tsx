import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTeachingStore } from "../state/teachingStore";

const TOPICS = [
  { title: "Expanding (a+b)²", blurb: "Area model · algebra" },
  { title: "Factorization basics", blurb: "Break numbers & expressions" },
  { title: "Quadratic equations", blurb: "Solve with visuals" },
  { title: "Pythagorean theorem", blurb: "Right triangles" },
  { title: "Fractions and mixed numbers", blurb: "Build intuition" },
  { title: "Photosynthesis", blurb: "Biology · process map" },
  { title: "Newton's laws of motion", blurb: "Physics foundations" },
  { title: "Supply and demand", blurb: "Economics basics" },
  { title: "How DNA replication works", blurb: "Biology · steps" },
  { title: "Intro to probability", blurb: "Chance with diagrams" },
];

export function LessonsPage() {
  const navigate = useNavigate();
  const setTopicRequest = useTeachingStore((s) => s.setTopicRequest);
  const [custom, setCustom] = useState("");

  const startTopic = (topic: string) => {
    const t = topic.trim();
    if (!t) return;
    setTopicRequest(t, `Teach me ${t} on the whiteboard`);
    navigate(`/lesson?topic=${encodeURIComponent(t)}`);
  };

  return (
    <section className="page lessons-page">
      <h1>Lessons</h1>
      <p className="lede">
        Pick a suggestion — or type any topic. Mentora can teach{" "}
        <strong>anything</strong>.
      </p>

      <form
        className="ask-bar"
        onSubmit={(e) => {
          e.preventDefault();
          startTopic(custom);
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Any topic… chemistry, history, coding, music theory…"
          aria-label="Custom lesson topic"
        />
        <button type="submit" className="btn primary">
          Start
        </button>
      </form>

      <div className="topic-grid">
        {TOPICS.map((topic) => (
          <article key={topic.title} className="topic-card">
            <div>
              <strong>{topic.title}</strong>
              <p>{topic.blurb}</p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => startTopic(topic.title)}
            >
              Learn
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
