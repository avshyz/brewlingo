// Detect back navigation (not forward) and reverse slide direction
function isBackNavigation() {
  const nav = navigation.activation;
  if (nav?.navigationType !== 'traverse') return false;
  return nav.from?.index > navigation.currentEntry?.index;
}

window.addEventListener('pageswap', (e) => {
  if (e.viewTransition) {
    e.viewTransition.types.add('slide');
    if (isBackNavigation()) e.viewTransition.types.add('back');
  }
});

window.addEventListener('pagereveal', (e) => {
  if (e.viewTransition) {
    e.viewTransition.types.add('slide');
    if (isBackNavigation()) e.viewTransition.types.add('back');
  }
});
