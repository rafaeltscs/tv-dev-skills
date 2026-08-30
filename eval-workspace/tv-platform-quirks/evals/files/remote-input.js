// Global remote-control handling for our web TV app. We ship the same
// build to LG (webOS 5 / 6) and Samsung (Tizen 6.0 / 6.5). QA on the
// Samsung set reports: the Back button "does nothing" on some screens and
// "exits the whole app" on others, and the coloured buttons we bound for
// quick filters never fire at all. Works on the dev machine in Chrome.

const KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  BACK: 8, // backspace on the keyboard while developing
  RED: 403,
  GREEN: 404,
};

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowLeft': return app.move('left');
    case 'ArrowRight': return app.move('right');
    case 'ArrowUp': return app.move('up');
    case 'ArrowDown': return app.move('down');
    case 'Enter': return app.select();
    case 'Backspace': return history.back();
    default: return;
  }
});

// colour buttons -> filter shortcuts
window.addEventListener('keydown', (e) => {
  if (e.keyCode === KEY.RED) app.toggleFilter('new');
  if (e.keyCode === KEY.GREEN) app.toggleFilter('free');
});
