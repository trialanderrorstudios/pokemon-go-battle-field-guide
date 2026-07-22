import { escapeHtml } from "./home.js";


function modeToggle(mode) {
  return `<div class="placement-controls" aria-label="Question direction">
    <button type="button" data-drill-mode="forward" aria-pressed="${mode === "forward"}">Effective against</button>
    <button type="button" data-drill-mode="reverse" aria-pressed="${mode === "reverse"}">Weak to</button>
  </div>`;
}


function chip(type, question, answered) {
  const isCorrect = type === question.correctType;
  const isPicked = type === question.selectedType;
  const state = answered && isCorrect ? " is-correct" : answered && isPicked ? " is-wrong" : "";
  return `<button type="button" class="drill-chip${state}" data-drill-choice="${escapeHtml(type)}" data-type="${escapeHtml(type)}" aria-pressed="${isPicked}"${answered ? " disabled" : ""}>${escapeHtml(type)}</button>`;
}


function endMessage(correctCount, total, missedTypes) {
  const uniqueMissed = [...new Set(missedTypes)];
  if (!uniqueMissed.length) return `${correctCount}/${total} — clean sweep!`;
  const verb = uniqueMissed.length === 1 ? "still trips you up" : "still trip you up";
  return `${correctCount}/${total} — ${escapeHtml(uniqueMissed.join(", "))} ${verb}`;
}


function endScreen(drill) {
  const total = drill.questions.length;
  const correctCount = total - drill.missedTypes.length;
  return `<div class="more-section" aria-labelledby="drill-end-title">
    <p class="status-kicker">Round complete</p>
    <h2 id="drill-end-title">${endMessage(correctCount, total, drill.missedTypes)}</h2>
    <p>Best streak: ${drill.stats.bestStreak}</p>
    <button type="button" data-drill-restart>Play again</button>
  </div>`;
}


export function renderDrill(drill) {
  const total = drill.questions.length;
  if (!total) return `<div class="more-view"><a class="safe-escape" href="./#home">Back to Home</a><p>No drill questions available.</p></div>`;
  const body = drill.index >= total
    ? endScreen(drill)
    : (() => {
      const question = { ...drill.questions[drill.index], selectedType: drill.selectedType };
      const answered = drill.selectedType !== null;
      return `<div class="more-section" aria-labelledby="drill-question-title">
        <p class="status-kicker">Question ${drill.index + 1} of ${total} · Streak ${drill.stats.currentStreak} (best ${drill.stats.bestStreak})</p>
        <h2 id="drill-question-title">${escapeHtml(question.prompt)}</h2>
        <div class="placement-controls" role="group" aria-label="Answer choices">${question.choices.map((type) => chip(type, question, answered)).join("")}</div>
        ${answered ? `<p aria-live="polite"><strong>${drill.selectedType === question.correctType ? "Correct!" : "Not quite."}</strong> ${escapeHtml(question.why)}.</p><button type="button" data-drill-next>${drill.index + 1 < total ? "Next question" : "See results"}</button>` : ""}
      </div>`;
    })();
  return `<div class="more-view">
    <a class="safe-escape" href="./#home">Back to Home</a>
    <section class="more-section" aria-labelledby="drill-title">
      <p class="status-kicker">Type matchup drill</p>
      <h2 id="drill-title">What beats what?</h2>
      ${modeToggle(drill.mode)}
    </section>
    ${body}
  </div>`;
}
