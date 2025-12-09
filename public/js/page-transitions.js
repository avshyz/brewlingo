// Simple page transitions: home = back, anywhere else = forward
// Disabled on mobile (< 500px)

const isMobile = window.matchMedia('(max-width: 500px)').matches;

function isHomePath(path) {
  return path === '/' || path === '/index.html' ||
         path === '/brewlingo/' || path === '/brewlingo/index.html';
}

window.addEventListener('pageswap', (e) => {
  if (!e.viewTransition || isMobile) return;
  e.viewTransition.types.add('slide');
  const destUrl = e.activation?.entry?.url;
  if (destUrl && isHomePath(new URL(destUrl).pathname)) {
    e.viewTransition.types.add('back');
  }
});

window.addEventListener('pagereveal', (e) => {
  if (!e.viewTransition || isMobile) return;
  e.viewTransition.types.add('slide');
  if (isHomePath(location.pathname)) {
    e.viewTransition.types.add('back');
  }
});
