/**
 * Overlay Renderer — handles UI updates and mouse controls.
 */

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const modeBadge = document.getElementById('mode-badge');
const queueBadge = document.getElementById('queue-badge');
const welcomeMessage = document.getElementById('welcome-message');
const answerContent = document.getElementById('answer-content');
const answerArea = document.getElementById('answer-area');
const loadingBar = document.getElementById('loading-bar');
const toolbar = document.getElementById('toolbar');

// ===== TOOLBAR BUTTON HANDLERS (mouse-only, no keyboard needed) =====

document.getElementById('btn-capture').addEventListener('click', () => {
  window.examAPI.requestCapture();
});

document.getElementById('btn-send-all').addEventListener('click', () => {
  window.examAPI.requestSendAll();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  window.examAPI.requestClearQueue();
});

document.getElementById('btn-hide').addEventListener('click', () => {
  window.examAPI.requestHide();
});

document.getElementById('btn-quit').addEventListener('click', () => {
  window.examAPI.requestQuit();
});

document.getElementById('btn-clickthrough').addEventListener('click', () => {
  window.examAPI.requestClickThrough();
});

// ===== SMART CLICK-THROUGH LOGIC =====
// This allows clicking the "CLICK-THROUGH" badge even when the rest of the window ignores the mouse.

modeBadge.addEventListener('mouseenter', () => {
  // Stop ignoring mouse events when over this element
  window.examAPI.setIgnoreMouseEvents(false);
});

modeBadge.addEventListener('mouseleave', () => {
  // Go back to ignoring mouse events if we are in click-through mode
  if (modeBadge.textContent === 'CLICK-THROUGH') {
    window.examAPI.setIgnoreMouseEvents(true, { forward: true });
  }
});

modeBadge.addEventListener('click', () => {
  if (modeBadge.textContent === 'CLICK-THROUGH') {
    // Switch to Interactive Mode (hotkey simulation)
    // We don't have a direct IPC for this yet, let's use a new one
    window.examAPI.requestInteractiveMode();
  }
});

document.getElementById('btn-scroll-up').addEventListener('click', () => {
  answerArea.scrollBy({ top: -120, behavior: 'smooth' });
});

document.getElementById('btn-scroll-down').addEventListener('click', () => {
  answerArea.scrollBy({ top: 120, behavior: 'smooth' });
});

/**
 * Simple markdown-to-HTML converter for AI responses.
 */
function markdownToHTML(text) {
  let html = text;

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHTML(code.trim())}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers (### > ## > #)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold (**text**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Unordered lists (- item or * item)
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists (1. item)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Blockquotes (> text)
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-3]>)/g, '$1');
  html = html.replace(/(<\/h[1-3]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');

  return html;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Update the status indicator.
 */
function setStatus(status) {
  statusDot.className = 'status-dot';

  switch (status) {
    case 'capturing':
      statusDot.classList.add('capturing');
      statusText.textContent = 'Capturing...';
      loadingBar.classList.add('active');
      break;

    case 'thinking':
      statusDot.classList.add('thinking');
      statusText.textContent = 'AI Thinking...';
      loadingBar.classList.add('active');
      break;

    case 'ready':
      statusText.textContent = 'Answer Ready';
      loadingBar.classList.remove('active');
      break;

    case 'error':
      statusDot.classList.add('error');
      statusText.textContent = 'Error';
      loadingBar.classList.remove('active');
      break;

    case 'click-through':
      statusText.textContent = 'Click-through';
      modeBadge.textContent = 'CLICK-THROUGH';
      modeBadge.classList.remove('interactive');
      toolbar.classList.remove('visible');
      loadingBar.classList.remove('active');
      break;

    case 'interactive':
      statusText.textContent = 'Mouse Mode';
      modeBadge.textContent = 'MOUSE MODE';
      modeBadge.classList.add('interactive');
      toolbar.classList.add('visible');
      loadingBar.classList.remove('active');
      break;

    default:
      statusText.textContent = 'Ready';
      loadingBar.classList.remove('active');
  }
}

/**
 * Display an AI answer.
 */
function showAnswer(text) {
  welcomeMessage.style.display = 'none';
  answerContent.classList.add('visible');
  answerContent.innerHTML = markdownToHTML(text);
  answerArea.scrollTop = 0;
}

// ===== IPC Listeners =====
window.examAPI.onAnswer((data) => {
  showAnswer(data);
});

window.examAPI.onStatus((status) => {
  setStatus(status);
});

window.examAPI.onScreenshotAdded((count) => {
  if (count > 0) {
    queueBadge.textContent = count;
    queueBadge.classList.add('visible');
  } else {
    queueBadge.classList.remove('visible');
  }
});
