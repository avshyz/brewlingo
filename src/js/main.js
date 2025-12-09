const dialog = document.getElementById('card-dialog');
const dialogIcon = dialog.querySelector('.dialog-icon');
const dialogTitle = dialog.querySelector('.dialog-title');
const dialogHeader = dialog.querySelector('.dialog-header');
const dialogBody = dialog.querySelector('.dialog-body');
let activeCard = null;

const colorMap = {
  yellow: 'var(--yellow)',
  pink: 'var(--pink)',
  blue: 'var(--blue)',
  orange: 'var(--orange)',
  purple: 'var(--purple)',
  green: 'var(--green)',
  red: 'var(--red)',
  cyan: 'var(--cyan)',
  indigo: 'var(--indigo)',
  amber: 'var(--amber)'
};

function setChipTransitionNames(card, dialogEl) {
  // Set transition names on chips in card
  const chips = card.querySelectorAll('.chip[data-value]');
  chips.forEach(chip => {
    chip.style.setProperty('--chip-transition-name', chip.dataset.value);
    chip.style.setProperty('--icon-transition-name', chip.dataset.value + '-icon');
    chip.style.setProperty('--text-transition-name', chip.dataset.value + '-text');
  });

  // Set transition names on spectrum items in dialog
  const spectrumItems = dialogEl.querySelectorAll('.spectrum-item[data-value]');
  spectrumItems.forEach(item => {
    item.style.setProperty('--chip-transition-name', item.dataset.value);
    item.style.setProperty('--icon-transition-name', item.dataset.value + '-icon');
    item.style.setProperty('--text-transition-name', item.dataset.value + '-text');
  });
}

function clearChipTransitionNames(card, dialogEl) {
  const chips = card.querySelectorAll('.chip[data-value]');
  chips.forEach(chip => {
    chip.style.removeProperty('--chip-transition-name');
    chip.style.removeProperty('--icon-transition-name');
    chip.style.removeProperty('--text-transition-name');
  });

  const spectrumItems = dialogEl.querySelectorAll('.spectrum-item[data-value]');
  spectrumItems.forEach(item => {
    item.style.removeProperty('--chip-transition-name');
    item.style.removeProperty('--icon-transition-name');
    item.style.removeProperty('--text-transition-name');
  });
}

function openDialog(card) {
  activeCard = card;

  // Get data from the card
  const color = card.dataset.color;
  const icon = card.querySelector('.card-icon').innerHTML;
  const title = card.querySelector('.card-title').textContent;
  const content = card.querySelector('.card-content .card-inner').innerHTML;

  // Set icon color
  const dialogColor = colorMap[color] || 'var(--black)';
  dialog.style.setProperty('--dialog-color', dialogColor);

  // Populate dialog content before transition
  dialogIcon.innerHTML = icon;
  dialogTitle.textContent = title;
  dialogBody.innerHTML = content;

  // Use View Transitions API if available
  if (document.startViewTransition) {
    // Card has transition name in "old" state
    card.classList.add('transitioning');
    setChipTransitionNames(card, dialog);

    const transition = document.startViewTransition(() => {
      // In callback: remove from card, add to dialog
      // This makes dialog the "new" state target
      card.classList.remove('transitioning');
      dialog.classList.add('transitioning');
      document.body.classList.add('dialog-open');
      dialog.showModal();
    });

    transition.finished.then(() => {
      dialog.classList.remove('transitioning');
      clearChipTransitionNames(card, dialog);
    });
  } else {
    // Fallback for browsers without View Transitions
    dialog.classList.add('opening');
    document.body.classList.add('dialog-open');
    dialog.showModal();

    dialog.addEventListener('animationend', () => {
      dialog.classList.remove('opening');
    }, { once: true });
  }
}

function closeDialog() {
  if (document.startViewTransition && activeCard) {
    // Dialog has transition name in "old" state
    dialog.classList.add('transitioning');
    setChipTransitionNames(activeCard, dialog);

    // Inject swap CSS for closing transition (swap at 50%)
    const closeStyles = document.createElement('style');
    closeStyles.id = 'vt-close-styles';
    closeStyles.textContent = `
      ::view-transition-old(*) {
        animation: swap-out var(--transition-duration) ease-out forwards !important;
      }
      ::view-transition-new(*) {
        animation: swap-in var(--transition-duration) ease-out forwards !important;
      }
    `;
    document.head.appendChild(closeStyles);

    const transition = document.startViewTransition(() => {
      // In callback: remove from dialog, add to card
      // This makes card the "new" state target
      dialog.classList.remove('transitioning');
      activeCard.classList.add('transitioning', 'closing');
      dialog.close();
      document.body.classList.remove('dialog-open');
    });

    transition.finished.then(() => {
      activeCard.classList.remove('transitioning', 'closing');
      clearChipTransitionNames(activeCard, dialog);
      closeStyles.remove();
      activeCard = null;
    });
  } else {
    // Fallback
    dialog.classList.add('closing');
    dialog.addEventListener('animationend', () => {
      dialog.classList.remove('closing');
      dialog.close();
      document.body.classList.remove('dialog-open');
      activeCard = null;
    }, { once: true });
  }
}

// Close on backdrop click
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) {
    closeDialog();
  }
});

// Close button click handler
dialog.querySelector('.dialog-close').addEventListener('click', closeDialog);

// Close on Escape key (prevent default to use our animation)
dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeDialog();
});

// Card click handlers
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', () => openDialog(card));

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDialog(card);
    }
  });
});
