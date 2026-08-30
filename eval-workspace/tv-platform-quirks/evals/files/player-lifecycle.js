// Video playback wrapper for our Samsung Tizen app (Tizen 6.0+). We use
// AVPlay for the main content. Bug: when the user presses Home mid-playback
// and comes back to the app later, the next time they hit play the screen
// stays black and we get an AVPlay error, until the app is fully killed
// and relaunched. Sometimes returning from the TV's live-TV input does the
// same thing.

let avplay = null;

export function startPlayback(url) {
  avplay = webapis.avplay;
  avplay.open(url);
  avplay.setListener({
    onbufferingcomplete: () => avplay.play(),
    onstreamcompleted: () => stopPlayback(),
  });
  avplay.prepareAsync(() => avplay.play(), (err) => console.error(err));
}

export function stopPlayback() {
  if (avplay) {
    avplay.stop();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // pause so we don't waste bandwidth in the background
    if (avplay) avplay.pause();
  } else {
    if (avplay) avplay.play();
  }
});
