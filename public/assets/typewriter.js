function mountTypewriter(text) {
  const heading = text.closest('.typewriter-title');
  const phrases = JSON.parse(text.dataset.typewriter);
  const holdDuration = 4000;
  let phraseIndex = 0;
  let characters = Array.from(phrases[phraseIndex]);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = characters.length;
  let deleting = true;
  let timer;

  function schedule(delay) {
    timer = window.setTimeout(step, delay);
  }

  function step() {
    if (document.hidden || reducedMotion.matches) return;
    index += deleting ? -1 : 1;
    text.textContent = characters.slice(0, index).join('');

    if (!deleting && index === characters.length) {
      deleting = true;
      schedule(holdDuration);
    } else if (deleting && index === 0) {
      deleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      characters = Array.from(phrases[phraseIndex]);
      schedule(550);
    } else if (deleting) {
      schedule(38);
    } else {
      const lastCharacter = characters[index - 1];
      schedule(/[,.!]/.test(lastCharacter) ? 190 : 75);
    }
  }

  function syncVisibility() {
    window.clearTimeout(timer);
    const playing = !document.hidden && !reducedMotion.matches;
    heading.classList.toggle('is-typing', playing);
    if (playing) schedule(deleting && index === characters.length ? holdDuration : 550);
  }

  function reset() {
    window.clearTimeout(timer);
    phraseIndex = 0;
    characters = Array.from(phrases[phraseIndex]);
    index = characters.length;
    deleting = true;
    text.textContent = phrases[0];
    syncVisibility();
  }

  // The full greeting stays in the heading's accessible name; only its
  // decorative visual copy changes, so each character is not announced.
  reset();
  document.addEventListener('visibilitychange', syncVisibility);
  reducedMotion.addEventListener('change', reset);
}

document.querySelectorAll('[data-typewriter]').forEach(mountTypewriter);
