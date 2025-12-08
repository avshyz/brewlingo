// Detect back navigation (not forward) and reverse slide direction
function isBackNavigation() {
  const nav = navigation.activation;
  if (nav?.navigationType !== 'traverse') return false;
  return nav.from?.index > navigation.currentEntry?.index;
}

// Check if we should use back animation (set by previous page)
function shouldUseBackAnimation() {
  const useBack = sessionStorage.getItem('useBackAnimation') === 'true';
  sessionStorage.removeItem('useBackAnimation');
  return useBack;
}

// Mark links with data-back attribute to trigger back-slide animation
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-back]');
  if (link) {
    sessionStorage.setItem('useBackAnimation', 'true');
  }
});

window.addEventListener('pageswap', (e) => {
  if (e.viewTransition) {
    e.viewTransition.types.add('slide');
    if (isBackNavigation() || sessionStorage.getItem('useBackAnimation') === 'true') {
      e.viewTransition.types.add('back');
    }
  }
});

window.addEventListener('pagereveal', (e) => {
  if (e.viewTransition) {
    e.viewTransition.types.add('slide');
    if (isBackNavigation() || shouldUseBackAnimation()) {
      e.viewTransition.types.add('back');
    }
  }
});
